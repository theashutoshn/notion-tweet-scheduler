require('dotenv').config();
const { Client } = require('@notionhq/client');
const { TwitterApi } = require('twitter-api-v2');

// ✅ Initialize Notion Client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DB_ID;

// ✅ Initialize Twitter Client
const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// 📝 Fetch tweets from Notion (including Date & Time)
async function getScheduledTweets() {
    try {
        const response = await notion.databases.query({ database_id: databaseId });

        return response.results.map(page => {
            const tweetProp = page.properties.Tweet;
            const dateProp = page.properties.Scheduled;
            const timeProp = page.properties.Time;

            if (!tweetProp || !dateProp || !timeProp) {
                console.warn("⚠️ Missing required fields in Notion:", page.id);
                return null;  // Skip if missing required fields
            }

            const tweetText = tweetProp?.rich_text?.[0]?.text?.content || '';
            const dateValue = dateProp?.date?.start || null;
            const timeValue = timeProp?.rich_text?.[0]?.text?.content || null;

            if (!tweetText || !dateValue || !timeValue) return null;

            // Assuming date and time in Notion are in IST
            // Convert to a proper Date object
            const [hours, minutes] = timeValue.split(':');
            const scheduledAtIST = new Date(`${dateValue}T${hours}:${minutes}:00+05:30`);

            return { id: page.id, text: tweetText, scheduledAt: scheduledAtIST };
        }).filter(tweet => tweet !== null); // Remove invalid entries

    } catch (error) {
        console.error("❌ Error fetching tweets from Notion:", error);
        return [];
    }
}

// 🐦 Post tweet to X (Twitter)
async function postTweet(tweetText) {
    try {
        await twitterClient.v2.tweet(tweetText);
        console.log("✅ Tweet posted:", tweetText);
        return true;
    } catch (error) {
        console.error("❌ Error posting tweet:", error);
        return false;
    }
}

// Get current time in IST
function getCurrentTimeIST() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

// 🚀 Function to check for scheduled tweets
async function checkAndPostTweets() {
    console.log("📥 Fetching tweets from Notion...");
    const tweets = await getScheduledTweets();
    const nowIST = getCurrentTimeIST();

    console.log(`🕒 Current time (IST): ${nowIST.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

    for (let tweet of tweets) {
        console.log(`🕒 Checking tweet: "${tweet.text}" | Scheduled at: ${tweet.scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

        if (tweet.scheduledAt <= nowIST) {
            const success = await postTweet(tweet.text);
            if (success) {
                console.log(`🚀 Tweeted: ${tweet.text}`);
            }
        } else {
            console.log(`⏳ Skipping future tweet: "${tweet.text}" (Scheduled for ${tweet.scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })})`);
        }
    }

    console.log("✅ All tweets processed.");
}

// 🔁 Keep Running in a Loop Every 1 Minute
async function startScheduler() {
    console.log("📅 Tweet scheduler running in the background...");
    while (true) {
        await checkAndPostTweets();
        console.log("⏳ Waiting for 1 minute before checking again...");
        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds before next check
    }
}

// 🚀 Start the Scheduler
startScheduler();
