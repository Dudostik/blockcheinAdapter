import { XVGCoinService } from '../coin.service';
import { UTXO } from 'src/common';
import { ec } from 'elliptic';

describe('XVGCoinService', () => {
  let service: XVGCoinService;

  beforeAll(() => {
    service = new XVGCoinService();
  });

  test('addressCreate() generates valid XVG address', async () => {
    const addressInfo = await service.addressCreate('XVG');
    
    expect(addressInfo.address).toMatch(/^D[1-9A-HJ-NP-Za-km-z]{25,34}$/);
    expect(addressInfo.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(addressInfo.publicKey).toMatch(/^[0-9a-f]{66}$/);
    
    const ecInstance = new ec('secp256k1');
    const keyPair = ecInstance.keyFromPrivate(addressInfo.privateKey, 'hex');
    expect(keyPair.getPublic(true, 'hex')).toBe(addressInfo.publicKey);
  });

  test('addressValidate() validates correct address', async () => {
    const addressInfo = await service.addressCreate('XVG');
    const result = await service.addressValidate(
      'XVG',
      addressInfo.address,
      addressInfo.privateKey,
      addressInfo.publicKey
    );
    expect(result).toBe(true);
  });

  test('txBuild() throws on insufficient funds', async () => {
    const getUtxoMock = jest.spyOn(
      service as unknown as { getUtxo: (address: string) => Promise<UTXO[]> }, 
      'getUtxo'
    ).mockResolvedValue([
      { 
        txid: 'tx1', 
        vout: 0, 
        value: '0.5', 
        address: 'addr1',
        confirmations: 10,
        scriptPubKey: ''
      }
    ]);
  
    const params = {
      from: [{ address: 'addr1', value: '1.0' }],
      to: [{ address: 'addr2', value: '1.0' }],
      fee: { 
        networkFee: 0.01,
        properties: {} 
      }
    };
  
    await expect(service.txBuild('XVG', params))
      .rejects
      .toThrow('Insufficient funds');
  
    getUtxoMock.mockRestore();
  });
});
