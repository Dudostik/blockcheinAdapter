import {
  AddressCreateResult,
  AddressKeyPair,
  AddressValidateResult,
  BaseCoinService,
  BaseNodeAdapter,
  NodesOptions,
  TxSignResult,
  UTXO,
} from './common';
import { XVGNodeAdapter } from './node-adapter';
import { XVGTransactionParams } from './types';
import crypto from 'crypto';
import { ec as EC } from 'elliptic';
import baseX from 'base-x';
import Big from "big.js";
import { keccak256 } from 'ethereumjs-util';
import axios from 'axios';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const bs58 = baseX(BASE58);
const ec = new EC('secp256k1');

/**
 * Основной класс для все монеты.
 * Вместо ХХХ указываем тикер.
 * BaseCoinService - это базовый класс который определяет все методы и их типы.
 */
export class XVGCoinService extends BaseCoinService {
  public nodes: BaseNodeAdapter[] = [];
  public blockBooks: BaseNodeAdapter[] = [];
  public readonly network = 'XVG';
  protected mainNodeAdapter = XVGNodeAdapter;

  /**
   * Инициализация провайдера(ов).
   */
  initNodes(
    nodes: NodesOptions,
  ): void {
    this.nodes = Object.entries(nodes).map(([name, opts]) => {
      const url: string = opts.url;
      let headers: Array<{ name: string; value: string }>;

      if (opts.headers) {
        if (!headers?.length) {
          headers = [];
        }

        Object.entries(opts.headers).forEach(([name, value]) => {
          headers.push({ name, value });
        });
      }

      return new this.mainNodeAdapter(
        this.network,
        name,
        url,
        opts.confirmationLimit,
      );
    });
  }

  /**
   * Создает сервис с предустановленными настройками
   * @param network - Сеть (mainnet/testnet)
   */
  static createDefaultService(network: string = 'mainnet'): XVGCoinService {
    const service = new XVGCoinService();
    
    service.initNodes({
      nowNodes: {
        url: network === 'mainnet' 
          ? 'https://xvg.nownodes.io' 
          : 'https://xvg-testnet.nownodes.io',
        confirmationLimit: 10
      }
    });
    
    return service;
  }

  /**
   * Функция создания адреса.
   *
   * Генерация обычно состоит из нескольких пунктов
   * 1. Генерация случайного значения. Чаще всего используется `Buffer.from(crypto.randomBytes(32)`.
   * 2. Из случайного значения генерируется приватный ключ (privateKey).
   * 3. Из приватного ключа генерируется публичный ключ (publicKey).
   * 4. Из публичного ключа генерируется адрес.
   */
  async addressCreate(
    ticker: string,
  ): Promise<AddressCreateResult> {
    if (ticker !== 'XVG') {
      throw new Error(`Unsupported ticker: ${ticker}`);
    }

    let privateKeyBuffer: Buffer;
    do {
      privateKeyBuffer = crypto.randomBytes(32);
    } while (
      !ec.keyFromPrivate(privateKeyBuffer).validate() || privateKeyBuffer.equals(Buffer.alloc(32))
    );

    const privateKey = privateKeyBuffer.toString('hex');
    const keyPair = ec.keyFromPrivate(privateKeyBuffer);
    const publicKey = keyPair.getPublic(true, 'hex');

    const sha256 = crypto.createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest();
    const pubKeyHash = crypto.createHash('ripemd160').update(sha256).digest();
    
    const version = Buffer.from('1E', 'hex');
    const payload = Buffer.concat([version, pubKeyHash]);
    
    const checksum = crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(payload).digest())
      .digest()
      .slice(0, 4);
    
    const address = bs58.encode(Buffer.concat([payload, checksum]));

    return {
      address,
      privateKey,
      publicKey,
    };
  }

  /**
   * Функция валидации адреса.
   *
   * Проверяем адрес по разным шаблонам (длинна, символы, чек-сумма и тд.) Для разных сетей условия будут разные в зависимости от формата адресов.
   * В случае если адрес не прошел проверку не нужно генерировать ошибку, а нужно вернуть строку с описание какую проверку он не прошел.
   * В случае если пройдены все проверки возвращаем `true`.
   */
  async addressValidate(
    ticker: string,
    address: string,
    privateKey: string,
    publicKey: string,
  ): Promise<AddressValidateResult> {
    if (ticker !== 'XVG') {
      return `Unsupported ticker: ${ticker}`;
    }

    if (!address || !privateKey || !publicKey) {
      return 'Missing required parameters';
    }
  
    if (typeof address !== 'string' || address.length < 26 || address.length > 35) {
      return 'Invalid address length';
    }

    try {
      const decoded = bs58.decode(address);
      if (decoded.length < 5) return 'Invalid address length';
      
      const version = decoded[0];
      if (version !== 0x1E) return 'Invalid XVG address version';
      
      const payload = decoded.slice(0, -4);
      const checksum = decoded.slice(-4);
      
      const newChecksum = crypto.createHash('sha256')
        .update(crypto.createHash('sha256').update(payload).digest())
        .digest()
        .slice(0, 4);
      
        const isChecksumValid = checksum.every((byte, index) => byte === newChecksum[index]);
        if (!isChecksumValid) {
          return 'Invalid checksum';
        }
    } catch (e) {
      return 'Invalid XVG address format';
    }

    try {
      const keyPair = ec.keyFromPrivate(privateKey, 'hex');
      const derivedPublicKey = keyPair.getPublic(true, 'hex');
      
      if (derivedPublicKey !== publicKey) {
        return 'Public key does not match private key';
      }
      
      const sha256 = crypto.createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest();
      const pubKeyHash = crypto.createHash('ripemd160').update(sha256).digest();
      
      const version = Buffer.from('1E', 'hex');
      const payload = Buffer.concat([version, pubKeyHash]);
      
      const checksum = crypto.createHash('sha256')
        .update(crypto.createHash('sha256').update(payload).digest())
        .digest()
        .slice(0, 4);
      
      const derivedAddress = bs58.encode(Buffer.concat([payload, checksum]));
      
      if (derivedAddress !== address) {
        return 'Address does not match public key';
      }
    } catch (e) {
      return 'Invalid key pair';
    }

    return true;
  }

  /**
   * Функция подписи транзакции.
   *
   * Подпись транзакции необходима для того чтобы подтвердить что действительно владелец счета хочет перевести средства с этого адреса. Для подписи используется приватник.
   * Объект на подпись приходит такой который вы вернули в функции txBuild.
   */
  async txSign(
    ticker: string,
    privateKeys: AddressKeyPair,
    params: XVGTransactionParams,
  ): Promise<TxSignResult> {
    if (ticker !== 'XVG') {
      throw new Error(`Unsupported ticker: ${ticker}`);
    }

    if (!params || typeof params !== 'object') {
      throw new Error('Invalid transaction params: must be an object');
    }
  
    const allowedFields = ['from', 'to', 'fee', 'spent', 'utxo'];
    const unexpectedFields = Object.keys(params).filter(
      field => !allowedFields.includes(field)
    );
    
    if (unexpectedFields.length > 0) {
      throw new Error(
        `Transaction contains unexpected fields: ${unexpectedFields.join(', ')}`
      );
    }

    if (!params.from || !params.to) {
      throw new Error('Invalid transaction structure: missing "from" or "to"');
    }

    const from = Array.isArray(params.from) ? params.from : [params.from];
    const to = Array.isArray(params.to) ? params.to : [params.to];

    const signatures: string[] = [];
    for (const input of from) {
      const privateKey = privateKeys[input.address];
      if (!privateKey) {
        throw new Error(`Private key not found for address ${input.address}`);
      }

      const keyPair = ec.keyFromPrivate(privateKey, 'hex');
      
      const txData = JSON.stringify({
        from: input,
        to,
        fee: params.fee,
      });
      
      const txHash = keccak256(Buffer.from(txData)).toString('hex');
      const signature = keyPair.sign(txHash).toDER('hex');
      
      signatures.push(signature);
    }

    return {
      signedData: JSON.stringify(signatures),
      txHash: keccak256(Buffer.from(JSON.stringify(params))).toString('hex'),
    };
  }

  /**
   * Функция сборки транзакции.
   *
   * Билд транзакции — это сборки из исходного запроса `params` объекта адаптированного под сеть, которую остается только подписать.
   * Обычно флоу это функции следующее:
   * - проверка входящий данных (валидация);
   * - запрос необходимых сетевых данных (utxo/customNonce/height);
   * - приведение объекта к формату сети.
   */
  async txBuild(
    ticker: string,
    params: XVGTransactionParams,
  ): Promise<XVGTransactionParams> {
    if (ticker !== 'XVG') {
      throw new Error(`Unsupported ticker: ${ticker}`);
    }

    if (!params || typeof params !== 'object') {
      throw new Error('Invalid transaction params: must be an object');
    }
  
    const from = Array.isArray(params.from) ? params.from : [params.from];
    const to = Array.isArray(params.to) ? params.to : [params.to];
  
    if (from.length === 0 || to.length === 0) {
      throw new Error('Missing sender or recipient information');
    }
  
    const utxos: Record<string, UTXO[]> = {};
    let totalAvailable = new Big(0);
    for (const input of from) {
      if (!utxos[input.address]) {
        utxos[input.address] = await this.getUtxo(input.address);
        totalAvailable = utxos[input.address].reduce(
          (sum, utxo) => sum.plus(new Big(utxo.value)),
          totalAvailable
        );
      }
    }
  
    const totalOutput = to.reduce(
      (sum, output) => sum.plus(new Big(output.value)),
      new Big(0)
    );
  
    const feeRate = new Big(params.fee?.networkFee?.toString() || '0.1');
    
    if (totalAvailable.lt(totalOutput.plus(feeRate))) {
      throw new Error('Insufficient funds to cover transaction fee');
    }
  
    const spentUtxos: Record<string, string[]> = {};
    const usedUtxos: Record<string, string[]> = {};
    
    for (const [address, addressUtxos] of Object.entries(utxos)) {
      spentUtxos[address] = params.spent?.[address] || [];
      usedUtxos[address] = addressUtxos
        .filter(utxo => !spentUtxos[address].includes(`${utxo.txid}|${utxo.vout}`))
        .map(utxo => `${utxo.txid}|${utxo.vout}`);
    }
  
    return {
      from,
      to,
      fee: { 
        networkFee: params.fee?.networkFee || 0.1,
        properties: {}
      },
      spent: spentUtxos,
      utxo: usedUtxos,
    };
  }

  protected async getUtxo(
    address: string
  ): Promise<UTXO[]> {
    if (!this.nodes[0]) {
      throw new Error('No node adapter initialized');
    }

    try {
      const response = await axios.get(`${process.env.UTXO_PROXY_URL}/utxo`, {
        params: {
          network: this.network.toLowerCase(),
          address,
        },
      });

      return response.data.utxos.map((utxo: any) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: new Big(utxo.value).toString(),
        confirmations: utxo.confirmations,
        address: utxo.address
      }));
    } catch (error) {
      throw new Error(`Error fetching UTXO: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
