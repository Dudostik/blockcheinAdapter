import { jest } from '@jest/globals';
import axios from 'axios';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeAll(() => {
  mockedAxios.request.mockImplementation((config) => {
    return Promise.resolve({
      data: {
        jsonrpc: "2.0",
        id: "test",
        result: null,
        error: null
      }
    });
  });
});

beforeEach(() => {
  mockedAxios.request.mockClear();
});

const mockRpcResponse = (result: any, error: any = null) => ({
  data: {
    jsonrpc: "2.0",
    id: "test",
    result,
    error
  }
});

export { mockedAxios, mockRpcResponse };