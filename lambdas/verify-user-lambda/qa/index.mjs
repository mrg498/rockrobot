import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

const userTableName = process.env.user_table_name;

export const handler = async (event) => {
    try {
        const body = new URLSearchParams(event.body);
        const fromNumber = body.get('From'); // The sender's phone number
        const messageBody = body.get('Body').trim().toLowerCase(); // The message content

        // Check for 'yes' or 'no' responses
        if (['y', 'yes'].includes(messageBody)) {
            // Update the user record to mark them as verified
            const params = {
                TableName: userTableName,
                Key: { phoneNumber: fromNumber },
                UpdateExpression: 'SET verified = :verified, retryVerify = :retryVerify, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':verified': true,
                    ':retryVerify': false,
                    ':updatedAt': new Date().toISOString(),
                },
            };

            await dynamoDb.send(new UpdateCommand(params));
            return { statusCode: 200, body: 'User verified' };
        } else if (['n', 'no'].includes(messageBody)) {
            // Delete the user record from DynamoDB
            const params = {
                TableName: userTableName,
                Key: { phoneNumber: fromNumber },
            };

            await dynamoDb.send(new DeleteCommand(params));
            return { statusCode: 200, body: 'User unsubscribed' };
        } else {
            // Ignore non-yes/no responses
            return { statusCode: 400, body: 'Invalid response' };
        }
    } catch (error) {
        console.error('Error processing message:', error);
        return { statusCode: 500, body: 'Error processing message' };
    }
};
