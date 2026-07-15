import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { log, hashUserId } from '../shared/log';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const OPENID_TABLE = process.env.OPENID_TABLE!;

export async function storeOpenIdMapping(openId: string, userId: string): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: OPENID_TABLE,
      Item: { openId, userId },
    }));
  } catch (e: any) {
    log('ERROR', 'openid_put_failed', { openIdHash: hashUserId(openId), error: e.message, name: e.name });
    throw e;
  }
}

export async function getOpenIdMapping(openId: string): Promise<string | null> {
  try {
    const resp = await ddb.send(new GetCommand({
      TableName: OPENID_TABLE,
      Key: { openId },
      ConsistentRead: true,
    }));
    return resp.Item?.userId ?? null;
  } catch (e: any) {
    log('ERROR', 'get_openid_mapping_failed', { openIdHash: hashUserId(openId), error: e.message, name: e.name });
    throw e;
  }
}
