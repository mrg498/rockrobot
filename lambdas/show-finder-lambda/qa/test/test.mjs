import { shows } from './showsData.mjs'
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


const getRecommendedShowsForToday = (shows) => {
  const todayString = `Shows for ${new Date().toLocaleDateString()}`;

  const startOfDay = new Date('2024-09-26');
  startOfDay.setHours(6, 0, 0, 0); 

  const endOfDay = new Date();
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
    title: todayString,
    shows: filteredShows,
  };
};

const generateSMSMessage = (recommendedShows) => {
  let message = `${recommendedShows.title}\n\n`;

  recommendedShows.shows.forEach(show => {

    const bandsJoined = show.bands.join(', ')

    const obscenityMatches = matcher.getAllMatches(bandsJoined)
    console.log(obscenityMatches)
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

const recShows = getRecommendedShowsForToday(shows)
console.log(recShows)
const message = generateSMSMessage(recShows)

console.log(message)
console.log(message.length)