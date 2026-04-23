import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { expect } from 'vitest';

export interface ToolCallOptions {
  expectedResult?: Record<string, unknown>;
  expectError?: boolean;
}

export class ToolCaller {
  private readonly _client: Client;

  constructor(client: Client) {
    this._client = client;
  }

  async call(
    toolName: string,
    args: Record<string, unknown>,
    options: ToolCallOptions = {},
  ): Promise<Awaited<ReturnType<Client['callTool']>>> {
    if (options.expectedResult !== undefined && options.expectError === true) {
      throw new Error('expectedResult and expectError are mutually exclusive');
    }

    const result = await this._client.callTool({ name: toolName, arguments: args });

    if (options.expectedResult !== undefined) {
      expect(result.structuredContent).toEqual(options.expectedResult);
    } else if (options.expectError === true) {
      expect(result.isError).toBe(true);
    }

    return result;
  }
}
