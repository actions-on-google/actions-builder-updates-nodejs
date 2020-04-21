const {
  conversation,
  Suggestion,
} = require('actions-on-google');
const functions = require('firebase-functions');
const {auth} = require('google-auth-library');
const request = require('request');
const util = require('util');

const SERVICE_ACCOUNT_KEY = require('./service-account.json');

// Days of the week
const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Suggestion chip titles
const SuggestionTitle = {
  HOURS: 'Ask about hours',
  CLASSES: 'Learn about classes',
  DAILY: 'Send daily reminders',
  NOTIFICATIONS: 'Get notifications',
};

// Class schedule
const schedule = {
    classes: [
        'Yoga',
        'Cycling',
        'Dance',
        'Kickboxing',
    ],
    days: {
        Monday: [
            {
                name: 'Yoga',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Cycling',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Yoga',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
        Tuesday: [
            {
                name: 'Kickboxing',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Dance',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Kickboxing',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
        Wednesday: [
            {
                name: 'Yoga',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Yoga',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Yoga',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
        Thursday: [
            {
                name: 'Kickboxing',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Cycling',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Kickboxing',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
        Friday: [
            {
                name: 'Yoga',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Yoga',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Yoga',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
        Saturday: [
            {
                name: 'Cycling',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Yoga',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Kickboxing',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
        Sunday: [
            {
                name: 'Cycling',
                startTime: '6am',
                endTime: '7am',
            },
            {
                name: 'Yoga',
                startTime: '7am',
                endTime: '8am',
            },
            {
                name: 'Dance',
                startTime: '6pm',
                endTime: '7pm',
            },
            {
                name: 'Kickboxing',
                startTime: '7pm',
                endTime: '8pm',
            },
        ],
    },
};

const sendPostRequest = util.promisify(request.post);

/**
 * Send a push notification via POST request to the Actions API endpoint
 * @param {object} accessToken Access token provided as the Authorization bearer token.
 * @param {object} notification Push notification specifying target user and intent.
 * @return {object} the response of the post request.
 */
async function sendPushNotification(accessToken, notification) {
  const response = await sendPostRequest('https://actions.googleapis.com/v2/conversations:send', {
    'auth': {
      'bearer': accessToken,
    },
    'json': true,
    'body': {'customPushMessage': notification, 'isInSandbox': true},
  });
  return response;
}

const app = conversation();

app.handle('classes', (conv) => {
  const day = conv.intent.params.day ?
    conv.intent.params.day.resolved : DAYS[new Date().getDay()];
  const classes =
    [...new Set(schedule.days[day].map((d) => `${d.name} at ${d.startTime}`))]
    .join(', ');
  conv.add(`On ${day} we offer the following classes: ${classes}. ` +
    `Would you like to receive daily reminders of upcoming ` +
    `classes, subscribe to notifications about cancelations, or can I help ` +
    `you with anything else?`);
  conv.add(new Suggestion({ title: SuggestionTitle.DAILY}));
  conv.add(new Suggestion({ title: SuggestionTitle.NOTIFICATIONS}));
  conv.add(new Suggestion({ title: SuggestionTitle.HOURS}));
});

app.handle('subscribe_to_notifications', (conv) => {
  const intentName = 'notification_trigger';
  const notificationsSlot =
    conv.session.params[`NotificationsSlot_${intentName}`];
  if (notificationsSlot.permissionStatus === 'PERMISSION_GRANTED') {
    const updateUserId = notificationsSlot.additionalUserData.updateUserId;
    // Store the user ID and the notification’s target intent for later use.
    // (Use a database like Firestore for best practice).
    if (!conv.user.params.notificationSubscriptions) {
      conv.user.params.notificationSubscriptions = [];
    }
    conv.user.params.notificationSubscriptions.push({
      userId: updateUserId,
      intent: intentName,
    });
  }
});

// Trigger a test push notification mid-conversation
app.handle('cancel_class', async (conv) => {
  const client = auth.fromJSON(SERVICE_ACCOUNT_KEY);
  // Use the Actions API to send a Google Assistant push notification.
  client.scopes = ['https://www.googleapis.com/auth/actions.fulfillment.conversation'];

  let tokens;
  try {
    tokens = await client.authorize();
  } catch(err) {
    throw new Error(`Auth error: ${err}`);
  }
  // Send push notifications to every user who’s
  // currently opted in to receiving notifications.
  const notificationPromises =
    conv.user.params.notificationSubscriptions.map((subscription) => {
      const notification = {
        userNotification: {
          title: 'Test Notification from Action Gym',
        },
        target: {
          userId: subscription.userId,
          intent: subscription.intent,
        },
      };
      return sendPushNotification(tokens.access_token, notification);
    });
  try {
    await Promise.all(notificationPromises);
    conv.add('A notification has been sent to all subscribed users.');
  } catch(err) {
    throw new Error(`Error when sending notifications: ${err}`);
  }
});

exports.ActionsOnGoogleFulfillment = functions.https.onRequest(app);

