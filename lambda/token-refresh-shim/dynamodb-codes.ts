import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CODE_TABLE = process.env.CODE_TABLE!;

export interface CodeData {
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
}

export async function storeCode(code: string, data: CodeData): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: CODE_TABLE,
    Item: {
      code,
      userId: data.userId,
      codeChallenge: data.codeChallenge,
      redirectUri: data.redirectUri,
      expiresAt: data.expiresAt,
      ttl: Math.floor(data.expiresAt) + 60,
    },
    ConditionExpression: 'attribute_not_exists(code)',
  }));
}

export async function retrieveAndDeleteCode(code: string): Promise<CodeData | null> {
  // Atomic single-use: DeleteItem with ReturnValues=ALL_OLD claims the code
  // exactly once. If two requests race, only one sees the Attributes payload;
  // the other sees Attributes=undefined.
  const resp = await ddb.send(new DeleteCommand({
    TableName: CODE_TABLE,
    Key: { code },
    ReturnValues: 'ALL_OLD',
  }));
  if (!resp.Attributes) return null;
  return {
    userId: resp.Attributes.userId,
    codeChallenge: resp.Attributes.codeChallenge,
    redirectUri: resp.Attributes.redirectUri,
    expiresAt: resp.Attributes.expiresAt,
  };
}
