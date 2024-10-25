import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';

const userTableName = process.env.user_table_name;
const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

// environment stage
const envStage = process.env.stage

// Twilio credentials from environment variables
const accountSid = process.env.twilio_account_sid;
const authToken = process.env.twilio_auth_token;
const messagingServiceSid = process.env.twilio_messaging_service_sid;
const twilioClient = twilio(accountSid, authToken);

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

            const verifyMessage = `${envStage === 'QA' ? 'QA ': ''} You're verified. Rock On!`;
            await twilioClient.messages.create({
                body: verifyMessage,
                messagingServiceSid: messagingServiceSid,
                to: phoneNumber
            });

        } else if (['N', 'NO', 'STOP'].includes(response)) {
            // Delete the user record
            const deleteParams = {
                TableName: userTableName,
                Key: { phoneNumber },
            };

            await dynamoDb.send(new DeleteCommand(deleteParams));
            console.log(`User ${phoneNumber} unsubscribed and deleted.`);

            const unsubMessage = `${envStage === 'QA' ? 'QA ': ''} You're unsubscribed. Go be free`;
            await twilioClient.messages.create({
                body: unsubMessage,
                messagingServiceSid: messagingServiceSid,
                to: phoneNumber
            });

        } else {
            console.log(`Unexpected User response: ${response}`)
            return
        }
        console.log('Request processed successfully')
    } catch (error) {
        console.error('Error processing response:', error);
    }
};
