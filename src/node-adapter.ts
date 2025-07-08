import axios from 'axios';
import Big from "big.js";
import {
  AdapterType,
  BalanceByAddressResult,
  BaseNodeAdapter,
  GetBlockResult,
  GetHeightResult,
  TxByHashResult,
  Transaction,
  FromParams,
  ToParams,
  TxStatus,
} from './common';
import { XVGTransactionBroadcastParams, XVGTransactionBroadcastResults } from './types';

/**
 * Класс, который инициализируется в XxxCoinService для выполнения сетевых запросов.
 *
 * Вместо ХХХ указываем тикер.
 * BaseNodeAdapter - это базовый класс который определяет все методы и их типы.
 * @param network - короткое название сети.
 * @param name - Название провайдера, под которого пишется адаптер (NowNodes, GetBlock, Ankr  и тд).
 * @param confirmationLimit - Количество конфирмаций, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 * @param utxoConfirmationLimit - Опциональное значение, используется только для сетей с utxo. Количество конфирмаций для utxo, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 */
export class XVGNodeAdapter extends BaseNodeAdapter {
  constructor(
    readonly network: string,
    readonly name: string = 'NowNodes',
    readonly url: string = 'https://xvg.nownodes.io',
    readonly confirmationLimit: number = 10,
    // readonly utxoConfirmationLimit?: number,
    readonly apiKey?: string,
    readonly type = AdapterType.Node,
  ) {
    super();
    this.apiKey = apiKey || process.env.NOWNODES_API_KEY || '';
  }

  /**
   * Функция, которая возвращается отформатированные данных по hash'у транзакции и тикеру.
   *
   * Стандартная реализация подразумевает сетевой запрос в сеть по hash'у и получение сырых данных из сети. Которые потом форматируются под ответ.
   * 1. Валидация по методу. В данной реализации поддерживаем только дефолтный метод трансфера. От сети к сети этот метод может отличаться, он может быть как дефолтный и заложен сетью, так и выполняться через специализированный контракт.
   * 2. Валидация по тикеру. Транзакции могут быть как токеновые, так и с нативной монетой. В данное реализации интересуют только транзакции нативной монеты.
   * 3. Валидация по статусу.
   *
   * Рекомендуется сделать дополнительный метод "processTransaction" который будет форматировать сырую транзакцию (не приведенную к общему типу) к формату который требуется на выходе TxByHashResult.
   * Если транзакция является batch-транзакцией (одна транзакция, где средства поступают на несколько адресов), то их необходимо разделить на разные транзакции с одним hash'ом.
   *
   * В случая если сеть не btc-like (нет utxo) и processTransaction вернул массив транзакций, то необходимо взять только первую транзакцию. Так как этот метод, в основном, важен только для получения статуса транзакции.
   */
  async txByHash(
    ticker: string,
    hash: string,
  ): Promise<TxByHashResult> { 
    if (ticker !== 'XVG') {
      throw new Error('Unsupported ticker');
    }

    const response = await this.request<{result: any}, any>(
      'POST',
      this.url,
      {
        jsonrpc: "1.0",
        id: "curltest",
        method: "getrawtransaction",
        params: [hash, true]
      }
    );
  
    const rawTx = response.result;
    if (!rawTx) {
      throw new Error('Transaction not found');
    }
  
    return this.processTransaction(rawTx);
  }

  /**
   * Функция запроса высоты блокчейна.
   */
  async getHeight(): Promise<GetHeightResult> {
      const response = await this.request<{result: number}, any>(
        'POST',
        this.url,
        {
          jsonrpc: "1.0",
          id: "curltest",
          method: "getblockcount",
          params: []
        }
      );
      return response.result;
  }

  /**
   * Функция запроса блока и транзакций которые в этом блоке находятся по его высоте.
   */
  async getBlock(
    height: number,
  ): Promise<GetBlockResult> {
      const hashResponse = await this.request<{result: string}, any>(
        'POST',
        this.url,
        {
          jsonrpc: "1.0",
          id: "curltest",
          method: "getblockhash",
          params: [height]
        }
      );
  
      const blockResponse = await this.request<{result: any}, any>(
        'POST',
        this.url,
        {
          jsonrpc: "1.0",
          id: "curltest",
          method: "getblock",
          params: [hashResponse.result, 2]
        }
      );
  
      return this.processBlock(blockResponse.result);
  }

  /**
   * Функция запроса баланса по адресу и тикеру.
   */
  async balanceByAddress(
    ticker: string,
    address: string,
  ): Promise<BalanceByAddressResult> {
    if (ticker !== 'XVG') {
      throw new Error('Unsupported ticker');
    }

    const response = await this.request<{result: any[]}, any>(
      'POST',
      this.url,
      {
        jsonrpc: "1.0",
        id: "curltest",
        method: "listunspent",
        params: [0, 9999999, [address]]
      }
    );

    const total = response.result.reduce((sum, utxo) => sum.plus(new Big(utxo.amount)), new Big(0));
    
    return {
      balance: total.toString(),
      totalBalance: total.toString()
    };
  }

  /**
   * Функция отправки в сеть подписанной транзакции.
   */
  async txBroadcast(
    ticker: string,
    params: XVGTransactionBroadcastParams,
  ): Promise<XVGTransactionBroadcastResults | { error: string }> {
    if (ticker !== 'XVG') {
      throw new Error('Unsupported ticker');
    }

    try {
      const response = await this.request<{result: string}, any>(
        'POST',
        this.url,
        {
          jsonrpc: "1.0",
          id: "curltest",
          method: "sendrawtransaction",
          params: [params.signedData]
        }
      );
  
      return { hash: response.result };
    } catch (error) {
      return { 
        error: `Error broadcasting transaction: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Функция-обертка для выполнения сетевого запроса.
   */
  protected async request<T, U>(
    method: 'POST' | 'GET' | 'PUT' | 'DELETE', 
    url: string,
    data?: U, 
    headers?: Record<string, string | number>,
  ): Promise<T> {
    const defaultHeaders = {
      'api-key': this.apiKey,
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios.request<T>({
        method,
        url,
        data,
        headers: { ...defaultHeaders, ...(headers || {}) },
      });
  
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Network error: ${error.message} | URL: ${url} | Status: ${error.response?.status}`);
      }
      throw new Error(`Unknown error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private processBlock(
    rawBlock: any,
  ): GetBlockResult {
    return {
      height: rawBlock.height,
      timestamp: new Date(rawBlock.time * 1000),
      transactions: rawBlock.tx.map((tx: any) => this.processTransaction(tx)),
      data: rawBlock
    };
  }

  private processTransaction(
    rawTx: any,
  ): Transaction {
    const inputs: FromParams[] = rawTx.vin.map((input: any) => ({
      address: input.address || 'coinbase', // для coinbase транзакций
      value: input.value ? new Big(input.value).toString() : '0'
    }));

    const outputs: ToParams[] = rawTx.vout.map((output: any) => ({
      address: output.scriptPubKey?.addresses?.[0] || '',
      value: new Big(output.value).toString()
    }));

    return {
      hash: rawTx.txid || rawTx.hash,
      ticker: 'XVG',
      from: inputs,
      to: outputs,
      status: rawTx.confirmations >= this.confirmationLimit ? 
        TxStatus.finished : TxStatus.unknown,
      height: rawTx.blockheight,
      confirmations: rawTx.confirmations,
      rawTx
    };
  }
}
