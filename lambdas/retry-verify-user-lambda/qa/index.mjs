import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';

const userTableName = process.env.user_table_name;
const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

// Twilio credentials from environment variables
const accountSid = process.env.twilio_account_sid;
const authToken = process.env.twilio_auth_token;
const messagingServiceSid = process.env.twilio_messaging_service_sid;
const twilioClient = twilio(accountSid, authToken);

// environment stage
const envStage = process.env.stage;

export const handler = async () => {
    try {
        // Fetch all users where verified = false and deleted = false
        const scanParams = {
            TableName: userTableName,
            FilterExpression: 'verified = :verified AND deleted = :deleted',
            ExpressionAttributeValues: {
                ':verified': false,
                ':deleted': false,
            },
        };

        const scanCommand = new ScanCommand(scanParams);
        const result = await dynamoDb.send(scanCommand);
        const users = result.Items;

        if (!users || users.length === 0) {
            console.log('No users found for verification retry.');
            return { statusCode: 200, body: 'No users to process' };
        }

        for (const user of users) {
            const phoneNumber = user.phoneNumber;
            const retryVerify = user.retryVerify;

            // if we have not retried verifying, try again
            if (!retryVerify) {
                // Send verification message and set retryVerify to false
                const retryMessage = `${envStage === 'QA' ? 'QA ' : ''}Reminder: Please reply with 'Y' or 'YES' to verify your phone number for Rock Robot.\nReply with 'N' or 'NO' to unsubscribe.`;

                try {
                    // Try sending the verification message
                    await twilioClient.messages.create({
                        body: retryMessage,
                        messagingServiceSid: messagingServiceSid,
                        to: phoneNumber,
                    });
                    console.log(`Verification resent for ${phoneNumber}.`);
                } catch (error) {
                    // Log the error but don't stop execution
                    console.error(`Failed to send verification message to ${phoneNumber}:`, error);
                }

                // Update retryVerify to false regardless of message sending success/failure
                try {
                    const updateParams = {
                        TableName: userTableName,
                        Key: { phoneNumber }, // No need to specify data type
                        UpdateExpression: 'SET retryVerify = :retryVerify, updatedAt = :updatedAt',
                        ExpressionAttributeValues: {
                            ':retryVerify': true,
                            ':updatedAt': new Date().toISOString(),
                        },
                    };

                    await dynamoDb.send(new UpdateCommand(updateParams));
                    console.log(`RetryVerify set to true for ${phoneNumber}.`);
                } catch (error) {
                    console.error(`Failed to update retryVerify for ${phoneNumber}:`, error);
                }
            } else {
                // If retryVerify is already true, delete the user
                try {
                    const deleteParams = {
                        TableName: userTableName,
                        Key: { phoneNumber }, // No need to specify data type
                    };

                    await dynamoDb.send(new DeleteCommand(deleteParams));
                    console.log(`User ${phoneNumber} hard deleted.`);
                } catch (error) {
                    // Log error but do not stop execution
                    console.error(`Failed to delete user ${phoneNumber}:`, error);
                }
            }
        }

        return {
            statusCode: 200,
            body: 'Retry verification process completed successfully',
        };
    } catch (error) {
        console.error('Error in retry verification process:', error);
        return {
            statusCode: 500,
            body: 'Error in retry verification process',
        };
    }
};
