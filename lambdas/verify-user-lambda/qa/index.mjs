import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const userTableName = process.env.user_table_name;
const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        // Parse the JSON body from the API Gateway which has the
        // x-www-form-urlencoded req from twilio. I know this is weird
        console.log('event:', JSON.stringify(event, null, 2));
        const params = new URLSearchParams(event.body);
        const phoneNumber = params.get('From');
        const messageBody = params.get('Body');

        // Normalize the message to make it case-insensitive
        const response = messageBody.trim().toUpperCase();

        // Check the response for verification
        if (['Y', 'YES'].includes(response)) {
            // Update user record to set verified to true and retryVerify to false
            const updateParams = {
                TableName: userTableName,
                Key: { phoneNumber },
                UpdateExpression: 'SET verified = :verified, retryVerify = :retryVerify, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':verified': true,
                    ':retryVerify': false,
                    ':updatedAt': new Date().toISOString(),
                },
            };

            await dynamoDb.send(new UpdateCommand(updateParams));
            console.log(`User ${phoneNumber} successfully verified.`);
        } else if (['N', 'NO'].includes(response)) {
            // Delete the user record
            const deleteParams = {
                TableName: userTableName,
                Key: { phoneNumber },
            };

            await dynamoDb.send(new DeleteCommand(deleteParams));
            console.log(`User ${phoneNumber} unsubscribed and deleted.`);
        } else {
            console.log(`Unexpected User response: ${response}`)
            return
        }
        console.log('Request processed successfully')
    } catch (error) {
        console.error('Error processing response:', error);
    }
};
