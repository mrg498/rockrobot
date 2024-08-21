import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';

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

    return {
      statusCode: 200,
      body: recommendedShows.length > 0 ? JSON.stringify(recommendedShows) : 'No show recs for today :(',
    };
  } catch (error) {
    console.error('Error fetching data:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not retrieve show data' }),
    };
  }
};

// Function to filter recommended shows for the current day
const getRecommendedShowsForToday = (shows) => {
  const today = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format
  return shows
    .filter(show => show.recommended && show.starts_at.startsWith(today))
    .map(show => ({
      venue: show.venue.name,
      age: show.age,
      sold_out: show.sold_out,
      tickets_url: show.tickets_url,
      bands: show.cached_bands.map(band => band.name),
    }));
};
