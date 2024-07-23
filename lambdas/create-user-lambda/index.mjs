import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';

const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    const body = JSON.parse(event.body);
    let { phoneNumber, address } = body;

    // Validate phone number
    const phoneNumberRegex = /^\+1\d{10}$/;
    if (!phoneNumberRegex.test(phoneNumber)) {
        return {
            statusCode: 400,
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
                body: JSON.stringify({ error: 'Invalid address.' }),
            };
        }

        const locationData = response.data[0];
        const latitude = locationData.lat;
        const longitude = locationData.lon;

        const params = {
            TableName: 'RockRobot-QA-Users',
            Item: {
                phoneNumber,
                latitude,
                longitude,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deleted: false,
                verified: false,
            },
        };
        console.log(params)
        await dynamoDb.send(new PutCommand(params));
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'User registered successfully' }),
        };
    } catch (error) {
        console.error('Error validating address:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not register user' }),
        };
    }
};