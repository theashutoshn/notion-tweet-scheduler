require('dotenv').config();
const { Client } = require('@notionhq/client');
const { TwitterApi } = require('twitter-api-v2');

// ✅ Initialize Notion & Twitter clients
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const databaseId = process.env.NOTION_DB_ID;

// ✅ Get tweets from Notion
async function getScheduledTweets() {
    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                and: [
                    {
                        property: 'isPublished',
                        checkbox: {
                            equals: false,
                        },
                    },
                    {
                        property: 'Scheduled',
                        date: {
                            is_not_empty: true,
                        },
                    },
                ],
            },
        });

        return response.results.map((page) => {
            const tweetProp = page.properties.Tweet;
            const scheduledProp = page.properties.Scheduled;

            const tweetText = tweetProp?.rich_text?.[0]?.text?.content || '';
            const scheduledAtStr = scheduledProp?.date?.start;

            if (!tweetText || !scheduledAtStr) return null;

            const scheduledAt = new Date(scheduledAtStr);

            return {
                id: page.id,
                text: tweetText,
                scheduledAt,
            };
        }).filter(Boolean);
    } catch (error) {
        console.error("❌ Error fetching tweets:", error);
        return [];
    }
}

// ✅ Post a tweet
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

// ✅ Mark tweet as published in Notion
async function markTweetAsPublished(pageId) {
    try {
        await notion.pages.update({
            page_id: pageId,
            properties: {
                isPublished: {
                    checkbox: true,
                },
            },
        });
        console.log(`✅ Marked tweet as published: ${pageId}`);
    } catch (error) {
        console.error(`❌ Failed to mark tweet as published: ${pageId}`, error);
    }
}

// ✅ Get current IST time
function getCurrentTimeIST() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

// ✅ Tweet scheduler
async function tweetScheduler() {
    console.log("📥 Fetching scheduled tweets...");
    const tweets = await getScheduledTweets();
    const now = getCurrentTimeIST();

    console.log(`🕒 Current IST time: ${now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

    for (const tweet of tweets) {
        console.log(`🔍 Checking tweet: "${tweet.text}" | Scheduled for: ${tweet.scheduledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);

        if (tweet.scheduledAt <= now) {
            const posted = await postTweet(tweet.text);
            if (posted) {
                await markTweetAsPublished(tweet.id);
            }
        } else {
            console.log(`⏳ Not time yet. Skipping "${tweet.text}"`);
        }
    }

    console.log("✅ Done processing cycle.\n");
}

// ✅ Start the scheduler every 1 minute
console.log("🚀 Tweet scheduler started...");
tweetScheduler(); // Run immediately
setInterval(tweetScheduler, 60 * 1000); // Then every 60 seconds
