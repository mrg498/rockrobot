import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';
import twilio from 'twilio';

const userTableName = process.env.user_table_name
const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

// Twilio credentials from environment variables
const accountSid = process.env.twilio_account_sid;
const authToken = process.env.twilio_auth_token;
const messagingServiceSid = process.env.twilio_messaging_service_sid;
const twilioClient = twilio(accountSid, authToken);

export const handler = async (event) => {
    const body = JSON.parse(event.body);
    let { phoneNumber, address } = body;

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

    // Remove all commas from the address
    address = address.replace(/,/g, '');

    // Validate address and get latitude and longitude
    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
            params: {
                format: 'json',
                countrycodes: 'us',
                q: address
            },
            headers: {
                'User-Agent': 'MyCustomUserAgent/1.0 (myemail@example.com)'
            }
        });

        if (response.data.length === 0) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ error: 'Invalid address.' }),
            };
        }

        const locationData = response.data[0];
        const latitude = locationData.lat;
        const longitude = locationData.lon;

        // Add user to DynamoDB
        const params = {
            TableName: userTableName,
            Item: {
                phoneNumber,
                latitude,
                longitude,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deleted: false,
                verified: false, // initially unverified
                retryVerify: false,
            },
        };
        await dynamoDb.send(new PutCommand(params));

        // Send welcome message
        const welcomeMessage = "Welcome to Rock Robot!\n\nYou have signed up to recieve a daily text message of reccomended live music shows in your area.\n\nPlease reply with 'Y' or 'YES' to verify your phone number.\n\nYou can reply with 'N' or 'NO' at any time to unsubscribe.";
        await twilioClient.messages.create({
            body: welcomeMessage,
            messagingServiceSid: messagingServiceSid,
            to: phoneNumber
        });

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
