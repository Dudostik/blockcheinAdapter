import axios, { AxiosResponse } from 'axios';
import Big from 'big.js';
import {
    AdapterType,
    BalanceByAddressResult,
    BaseNodeAdapter,
    GetBlockResult,
    GetHeightResult,
    TransactionBroadcastParams,
    TxBroadcastResult,
    TxByHashResult,
    TxStatus,
    UTXO,
} from './common';

export class XVGBlockBookAdapter extends BaseNodeAdapter {
  public txBroadcast(ticker: string, params: TransactionBroadcastParams): Promise<TxBroadcastResult> {
      throw new Error('Method not implemented.');
  }
  constructor(
    readonly network: string,
    readonly name: string = 'BlockBook',
    readonly url: string,
    readonly confirmationLimit: number,
    readonly type = AdapterType.BBook,
    readonly apiPrefix: string,
    apiVersion: string = 'v1',
    readonly utxoConfirmationLimit?: number,
  ) {
    super();
    this.network = network;
    this.name = name;
    this.url = url;
    this.confirmationLimit = confirmationLimit;
    this.apiPrefix = `/api/${apiVersion}`;
  }

  /**
   * Получает текущую высоту блокчейна
   */
  async getHeight(): Promise<GetHeightResult> {
    try {
      const response = await this.request<{ blockbook: { bestHeight: number } }>(
        'GET',
        `${this.apiPrefix}`
      );
      return response.blockbook.bestHeight;
    } catch (error) {
      throw new Error(`Failed to get height: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Получает блок по высоте или хэшу
   */
  async getBlock(heightOrHash: number | string): Promise<GetBlockResult> {
    try {
      const endpoint = typeof heightOrHash === 'number' 
        ? `${this.apiPrefix}/block/${heightOrHash}`
        : `${this.apiPrefix}/block/${heightOrHash}`;

      const response = await this.request<{
        hash: string;
        height: number;
        time: number;
        txs: Array<{ txid: string }>;
      }>('GET', endpoint);

      return {
        height: response.height,
        timestamp: new Date(response.time * 1000),
        transactions: response.txs.map(tx => ({
          hash: tx.txid,
          ticker: 'XVG',
          from: [],
          to: [],
          status: TxStatus.unknown,
          height: response.height
        })),
        data: response
      };
    } catch (error) {
      throw new Error(`Failed to get block: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Получает баланс адреса
   */
  async balanceByAddress(
    ticker: string,
    address: string
  ): Promise<BalanceByAddressResult> {
    try {
      const response = await this.request<{
        balance: string;
        unconfirmedBalance: string;
      }>('GET', `${this.apiPrefix}/address/${address}`);

      return {
        balance: response.balance,
        totalBalance: new Big(response.balance)
          .plus(response.unconfirmedBalance)
          .toString()
      };
    } catch (error) {
      throw new Error(`Failed to get balance: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Получает транзакцию по хэшу
   */
  async txByHash(ticker: string, hash: string): Promise<TxByHashResult> {
    try {
      const response = await this.request<{
        txid: string;
        vin: Array<{ addresses: string[]; value?: string }>;
        vout: Array<{ addresses: string[]; value?: string }>;
        confirmations: number;
        blockHeight?: number;
        blockTime?: number;
      }>('GET', `${this.apiPrefix}/tx/${hash}`);

      return {
        hash: response.txid,
        ticker,
        from: response.vin
          .filter(input => input.addresses && input.value)
          .map(input => ({
            address: input.addresses?.[0] || 'unknown',
            value: input.value || '0'
          })),
        to: response.vout
          .filter(output => output.addresses && output.value)
          .map(output => ({
            address: output.addresses?.[0] || 'unknown',
            value: output.value || '0'
          })),
        status: response.confirmations >= this.confirmationLimit
          ? TxStatus.finished
          : TxStatus.unknown,
        height: response.blockHeight,
        timestamp: response.blockTime ? new Date(response.blockTime * 1000) : undefined,
        confirmations: response.confirmations
      };
    } catch (error) {
      throw new Error(`Failed to get transaction: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Получает непотраченные выходы (UTXO) адреса
   */
  async utxoByAddress(ticker: string, address: string): Promise<UTXO[]> {
    try {
      const response = await this.request<{
        utxos: Array<{
          txid: string;
          vout: number;
          value: string;
          confirmations: number;
          address?: string;
        }>;
      }>('GET', `${this.apiPrefix}/utxo/${address}`);

      return response.utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        confirmations: utxo.confirmations,
        address: utxo.address || address
      }));
    } catch (error) {
      throw new Error(`Failed to get UTXO: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Общий метод для выполнения запросов
   */
  protected async request<T, U = any>(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: U,
    headers?: Record<string, string>
  ): Promise<T> {
    try {
      const url = `${this.url}${endpoint}`;
      const config = {
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 10000
      };

      const response: AxiosResponse<T> = await axios(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error || error.message;
        throw new Error(`BlockBook API error: ${message}`);
      }
      throw error;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error occurred';
  }
}