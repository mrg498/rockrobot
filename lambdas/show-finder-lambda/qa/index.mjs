import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import twilio from 'twilio';
import {
	RegExpMatcher,
	TextCensor,
	englishDataset,
	englishRecommendedTransformers,
  asteriskCensorStrategy,
  keepStartCensorStrategy,
} from 'obscenity';

//obscenity
const matcher = new RegExpMatcher({
	...englishDataset.build(),
	...englishRecommendedTransformers,
});

const censor = new TextCensor().setStrategy(keepStartCensorStrategy(asteriskCensorStrategy()));

// Twilio credentials
const accountSid = process.env.twilio_account_sid;
const authToken = process.env.twilio_auth_token;
const messagingServiceSid = process.env.twilio_messaging_service_sid; // Messaging Service SID
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
      Key: 'new_york.json',
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

    // Get recommended shows for 1 week from now
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const recommendedShows = getRecommendedShowsForDate(nextWeek, shows);

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
const getRecommendedShowsForDate = (dateObj, shows) => {
  const dateString = `Shows for ${dateObj.toLocaleDateString()}`;

  const startOfDay = new Date(dateObj);
  startOfDay.setHours(6, 0, 0, 0); 

  const endOfDay = new Date(dateObj);
  endOfDay.setDate(startOfDay.getDate() + 1);
  endOfDay.setHours(5, 59, 59, 999);

  const filteredShows = shows
    .filter(show => {
      if(!show.recommended) return false;

      const showStartTime = new Date(show.starts_at);
      return showStartTime >= startOfDay && showStartTime <= endOfDay
    })
    .map(show => ({
      venue: show.venue.name,
      age: show.age,
      sold_out: show.sold_out,
      tickets_url: show.tickets_url,
      bands: show.cached_bands.map(band => band.name),
    }));  

  return {
    title: dateString,
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
    if (user.phoneNumber.S) { // Ensure phoneNumber exists in the user object
      console.log(`Sending message to ${user.phoneNumber.S}`); // Log the phone number

      const response = await twilioClient.messages.create({
        body: message,
        messagingServiceSid: messagingServiceSid, // Use Messaging Service SID here
        to: user.phoneNumber.S,
      });

      console.log(`Message SID: ${response.sid}`); // Log the message SID
    }
  }
};

// Function to generate SMS message
const generateSMSMessage = (recommendedShows) => {
  let message = `${recommendedShows.title}\n\n`;

  recommendedShows.shows.forEach(show => {

    const bandsJoined = show.bands.join(', ')

    const obscenityMatches = matcher.getAllMatches(bandsJoined)

    const bandsFormatted = censor.applyTo(bandsJoined, obscenityMatches)

    message += `Venue: ${show.venue}\n`;
    message += `Bands: ${bandsFormatted}\n`;
    message += `Age: ${show.age ?? 'unknown'}\n`;
    if (show.sold_out) {
      message += 'SOLD OUT\n';
    }
    // check for url and profane name in url (twilio won't send any profanity)
    message += `${show.tickets_url && !(matcher.hasMatch(show.tickets_url)) ? `Tickets: ${show.tickets_url}\n\n` : '\n'}`;
  });

  let totalCharCount = message.length

  //limit message to 1600 chars because that's the max length twilio will send
  if(totalCharCount > 1600){
    let messageLength = totalCharCount
    let index = message.length - 1
    while(messageLength > 1600 && index >= 0){
      if(message.charAt(index) === '\n' && message.charAt(index - 1) === '\n'){
        messageLength = index + 1
      }
      index -= 1
    }

    message = message.slice(0, messageLength)
  }

  return message.trim();
};
