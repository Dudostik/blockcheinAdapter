import { XVGNodeAdapter } from '../node-adapter';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('XVGNodeAdapter', () => {
  let adapter: XVGNodeAdapter;
  const testApiKey = 'test-api-key';

  beforeEach(() => {
    adapter = new XVGNodeAdapter(
      'mainnet',
      'NowNodes',
      'https://xvg.nownodes.io',
      10,
      testApiKey
    );

    jest.clearAllMocks();
  });

  test('getHeight() returns block height', async () => {
    mockedAxios.request.mockResolvedValue({
      data: {
        jsonrpc: "2.0",
        id: "test",
        result: 1234567,
        error: null
      }
    });

    const height = await adapter.getHeight();
    
    expect(height).toBe(1234567);
    expect(mockedAxios.request).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://xvg.nownodes.io',
      headers: {
        'api-key': testApiKey,
        'Content-Type': 'application/json'
      },
      data: {
        jsonrpc: "1.0",
        id: expect.any(String),
        method: "getblockcount",
        params: []
      }
    });
  });

  test('txByHash() processes transaction correctly', async () => {
    const mockTx = {
      txid: "abc123",
      vin: [{ address: "input1", value: 1 }],
      vout: [{ value: 0.9, scriptPubKey: { addresses: ["output1"] } }],
      confirmations: 5
    };

    mockedAxios.request.mockResolvedValue({
      data: {
        jsonrpc: "2.0",
        id: "test",
        result: mockTx,
        error: null
      }
    });

    const tx = await adapter.txByHash('XVG', 'abc123');
    
    expect(tx.hash).toBe('abc123');
    expect(tx.from[0].address).toBe('input1');
    expect(tx.to[0].address).toBe('output1');
  });

  test('balanceByAddress() calculates balance correctly', async () => {
    const mockUtxos = [
      { address: "addr1", amount: 1.5 },
      { address: "addr1", amount: 0.5 }
    ];

    mockedAxios.request.mockResolvedValue({
      data: {
        jsonrpc: "2.0",
        id: "test",
        result: mockUtxos,
        error: null
      }
    });

    const balance = await adapter.balanceByAddress('XVG', 'addr1');
    expect(balance.totalBalance).toBe('2');
  });
});