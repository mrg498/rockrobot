# rockrobot
automated texts to alert about nearby shows. View the Projects tab to see the project board for tickets

## signup page
QA - https://mrg498.github.io/rockrobot/
to deploy to QA, copy contents from signup-form qa directory into gh-pages branch and push it up

PROD - https://rockrobotmusic.com/
to deploy to PROD, copy contents from signup-form prod directory to s3 bucket. Also create a cloudfront invalidation

## s3
show data from ohmyrockness api is stored in s3 bucket named ohmyrocknessdata. write now a lambda function called showData hits their api for NY every morning and dumps the JSON response in there. This is done on a schedule with an EventBridge cron job

## dynamoDb
users are stored in a dynamoDb table on AWS

## AWS lambdas
- create user lambda: Adds a user to our dynamoDB table of users
- show data lambda: gets the show data from ohmyrockness api
- show finder lambda: parses the ohmyrockness data and sends the twilio message

When uploading a lambda
- npm install (to make sure all requirments are installed)
- zip (compress) everything in the lambda folder inlcuding node_modules (don't include anything called test)
- upload to the lambda
- run a test on the lambda directly through the lambda console UI

## AWS API Gateway
This handles calling lambdas with a public facing endpoint address. We use it for signing up users. We should also use it for twilio webhook and reacting to user sent messages from twilio

## twilio
We have a messaging campaing running for this website on my twilio account


