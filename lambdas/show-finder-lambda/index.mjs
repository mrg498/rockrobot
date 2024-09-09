import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';

// Twilio credentials
const accountSid = process.env.twilio_account_sid;
const authToken = process.env.twilio_auth_token;
const twilioPhoneNumber = process.env.twilio_phone_number;
const twilioClient = twilio(accountSid, authToken);

// Initialize S3 and DynamoDB clients
const s3Client = new S3Client({ region: 'us-east-2' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event) => {
  try {
    // Fetch the JSON data from S3
    const s3Params = {
      Bucket: 'ohmyrocknessdata',
      Key: 'shows.json',
    };
    
    const command = new GetObjectCommand(s3Params);
    const s3Response = await s3Client.send(command);

    // Convert the S3 stream to a string
    const streamToString = (stream) => {
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
    };

    const jsonData = await streamToString(s3Response.Body);
    const shows = JSON.parse(jsonData);

    // Get today's recommended shows
    const recommendedShows = getRecommendedShowsForToday(shows);

    // Fetch all users from DynamoDB
    const users = await fetchAllUsers();

    // Send SMS to all users
    await sendSMSToUsers(users, recommendedShows);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'SMS sent to all users' }),
    };
  } catch (error) {
    console.error('Error fetching data:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not send SMS' }),
    };
  }
};

// Function to filter recommended shows for the current day
const getRecommendedShowsForToday = (shows) => {
  const today = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format
  const todayString = `Shows for ${new Date().toLocaleDateString()}`;

  const filteredShows = shows
    .filter(show => show.recommended && show.starts_at.startsWith(today))
    .map(show => ({
      venue: show.venue.name,
      age: show.age,
      sold_out: show.sold_out,
      tickets_url: show.tickets_url,
      bands: show.cached_bands.map(band => band.name),
    }));

  return {
    title: todayString,
    shows: filteredShows,
  };
};

// Function to fetch all users from DynamoDB
const fetchAllUsers = async () => {
  const params = {
    TableName: 'RockRobot-QA-Users',
    FilterExpression: "deleted = :deleted",
    ExpressionAttributeValues: {
      ":deleted": { BOOL: false }  // Specify the type as BOOL for boolean
    }
  };

  const command = new ScanCommand(params);
  const result = await dynamoDb.send(command);
  return result.Items;
};

// Function to send SMS to all users
const sendSMSToUsers = async (users, recommendedShows) => {
  let message = 'No featured shows today :('

  if (recommendedShows.shows.length > 0) {
    message = generateSMSMessage(recommendedShows);
  }
  
  for (const user of users) {
    if (user.phoneNumber.S === '+15129659420'){ // this is the twilio virtual number
      const response = await twilioClient.messages.create({
        body: message,
        from: twilioPhoneNumber,
        to: user.phoneNumber.S,
      });
    }
  }
};

// Function to generate SMS message
const generateSMSMessage = (recommendedShows) => {
  let message = `${recommendedShows.title}\n\n`;

  recommendedShows.shows.forEach(show => {
    message += `venue: ${show.venue}\n`
    message += `bands: ${show.bands.join(', ')}\n`;
    message += `age: ${show.age}\n`;
    if (show.sold_out) {
      message += 'SOLD OUT\n';
    }
    message += `${show.tickets_url ? `tickets: ${show.tickets_url}\n\n` : ''}`;
  });

  return message.trim();
};
