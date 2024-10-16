import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';

const userTableName = process.env.user_table_name
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
    const body = JSON.parse(event.body);
    let { phoneNumber, city } = body;

    const validCities = ['NEW_YORK', 'LOS_ANGELES', 'CHICAGO']

    // Validate phone number
    const phoneNumberRegex = /^\+1\d{10}$/;
    if (!phoneNumberRegex.test(phoneNumber)) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ error: 'Invalid phone number. Must start with +1 and be followed by 10 digits.' }),
        };
    }

    try {
        //Try and Send welcome message. This will error if the phone number is invalid
        const welcomeMessage = `${envStage === 'QA' ? 'QA ': ''}Welcome to Rock Robot!\n\nYou have signed up to recieve a daily text message of reccomended live music shows in your area.\n\nPlease reply with 'Y' or 'YES' to verify your phone number.\n\nYou can reply with 'N' or 'NO' at any time to unsubscribe.`;
        await twilioClient.messages.create({
            body: welcomeMessage,
            messagingServiceSid: messagingServiceSid,
            to: phoneNumber
        });

        // Add user to DynamoDB
        const params = {
            TableName: userTableName,
            Item: {
                phoneNumber,
                city: validCities.includes(city) ? city : 'NEW_YORK',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deleted: false,
                verified: false, // initially unverified
                retryVerify: false,
            },
        };
        await dynamoDb.send(new PutCommand(params));

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ message: 'User registered and welcome message sent successfully' }),
        };
    } catch (error) {
        console.error('Error registering user:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ error: 'Could not register user' }),
        };
    }
};
