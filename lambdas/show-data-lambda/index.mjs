// wip
import AWS from 'aws-sdk';
import cloudscraper from 'cloudscraper';

const s3 = new AWS.S3();
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // in milliseconds

const fetchData = async (url, options, retries = MAX_RETRIES) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await cloudscraper({
                method: 'GET',
                url,
                headers: options.headers,
                resolveWithFullResponse: true
            });

            if (response.statusCode === 200) {
                return response.body;
            } else {
                throw new Error(`Unexpected status code: ${response.statusCode}`);
            }
        } catch (error) {
            if (attempt === retries) {
                throw new Error(`Failed after ${retries} attempts: ${error.message}`);
            }
            console.warn(`Attempt ${attempt} failed: ${error.message}. Retrying in ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
};

export const handler = async (event) => {
    try {
        const url = 'https://www.ohmyrockness.com/api/shows.json?index=true&regioned=1';
        const options = {
            headers: {
                'Authorization': 'Token token="3b35f8a73dabd5f14b1cac167a14c1f6"',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://www.ohmyrockness.com'
            }
        };

        const responseBody = await fetchData(url, options);
        const showData = JSON.parse(responseBody);
        const jsonData = JSON.stringify(showData, null, 2);

        console.log(jsonData);

        const params = {
            Bucket: 'ohmyrocknessdata',
            Key: 'shows.json',
            Body: jsonData,
            ContentType: 'application/json'
        };

        await s3.putObject(params).promise();

        return {
            statusCode: 200,
            body: JSON.stringify('Show data updated successfully!')
        };
    } catch (error) {
        console.error('Error updating show data:', error);

        return {
            statusCode: 500,
            body: JSON.stringify('Error updating show data: ' + error.message)
        };
    }
};