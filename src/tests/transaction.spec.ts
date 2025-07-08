import { TxBroadcastResult, UTXO } from 'src/common';
import { XVGCoinService } from '../coin.service';

describe('Transaction Flow', () => {
  let service: XVGCoinService;
  const testKeyPair = {
    address: 'D5q6jF8q7H9kK2jH3kG7hF8J9kL2kG3hF8',
    privateKey: '5Kb8kLf9zgWQnogidDA76MzPL6TsZZY36hWXMssSzNydYXYB9KF'
  };
  
  class TestableXVGCoinService extends XVGCoinService {
    public async getUtxo(address: string): Promise<UTXO[]> {
      return super.getUtxo(address);
    }
  }
  
  beforeAll(() => {
    service = new TestableXVGCoinService();
      service.initNodes({
        NowNodes: {
          url: 'https://xvg.nownodes.io',
          confirmationLimit: 10
        }
      });
  
      jest.spyOn(service as any, 'getUtxo').mockResolvedValue([
      { 
        txid: 'tx1', 
        vout: 0, 
        value: '1.5', 
        address: testKeyPair.address,
        confirmations: 10,
        scriptPubKey: '76a914...'
      }
    ]);
  });
  
  test('complete tx flow: build -> sign -> broadcast', async () => {
    const params = {
      from: [{ address: testKeyPair.address, value: '1.0' }],
      to: [{ address: 'recipient', value: '1.0' }],
      fee: { 
        networkFee: 0.01,
        properties: {} 
      }
    };
      
    const builtTx = await service.txBuild('XVG', params);
    expect(builtTx.utxo).toBeDefined();
      
    const signedTx = await service.txSign('XVG', { 
      [testKeyPair.address]: testKeyPair.privateKey 
    }, builtTx);
      
    expect(signedTx.signedData).toBeTruthy();
    expect(signedTx.txHash).toMatch(/^[a-f0-9]{64}$/);
      
    const mockResult: TxBroadcastResult = { 
      hash: 'mocked_tx_hash' 
    };
    jest.spyOn(service.nodes[0], 'txBroadcast').mockResolvedValue(mockResult);
      
    const result = await service.nodes[0].txBroadcast('XVG', signedTx);
      
    if ('error' in result) {
      fail(`Broadcast failed: ${result.error}`);
    } else {
      expect(result.hash).toBe('mocked_tx_hash');
    }
  });
});