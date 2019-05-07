# RNChatkitWebhooks
A sample React Native chat app built with Chatkit which receives push notifications via Firebase and Chatkit Webhooks.

The app has the following features:

- Public and private rooms.
- Sending a message.
- Attaching image files.
- Loading older messages.
- Typing indicators.
- User presence indicator (whether the users in the room are offline or online).
- Joining public rooms.
- Receiving push notifications on the following events:
  - Room member leaves a room.
  - A new user is added to the room.
  - Current user is mentioned in a message of another member of the room.
  - Current user is offline (not currently in a private chat room).

### Prerequisites

-   React Native development environment
-   [Node.js](https://nodejs.org/en/)
-   [Yarn](https://yarnpkg.com/en/)
-   [Chatkit app instance](https://pusher.com/chatkit) with webhooks set up.
-   [Firebase project](https://console.firebase.google.com) with service account config.
-   [ngrok account](https://ngrok.com/)

## Getting Started

1.  Clone the repo:

```
git clone https://github.com/anchetaWern/RNChatkitWebhooks.git
cd RNChatkitWebhooks
```

2.  Install the app dependencies:

```
yarn
```

3.  Eject the project (re-creates the `android` folder):

```
react-native eject
```

4.  Link the packages:

```
react-native link react-native-gesture-handler
react-native link react-native-document-picker
react-native link react-native-fs
react-native link react-native-config
react-native link react-native-vector-icons
react-native link rn-fetch-blob
react-native link react-native-push-notification
```

5.  Update `android/build.gradle` file:

```
buildscript {
  ext {
    // ...
    supportLibVersion = "28.0.0"

    // add these:
    googlePlayServicesVersion = "+"
    firebaseVersion = "+"  
  }
  repositories { 
    //... 
  }
  dependencies {
    classpath 'com.android.tools.build:gradle:3.3.1'
    classpath 'com.google.gms:google-services:4.0.1' // add this
  }
}
```

6. Update `android/app/build.gradle`:

```
apply from: "../../node_modules/react-native/react.gradle"
apply from: project(':react-native-config').projectDir.getPath() + "/dotenv.gradle" // add this
```

```
dependencies {
  // ...  
  implementation project(':react-native-gesture-handler')
  // add these
  implementation 'com.google.firebase:firebase-core:16.0.1' 
  implementation 'com.google.firebase:firebase-core:16.0.8' 
  implementation 'com.google.android.gms:play-services-base:16.1.0' 
  // ...
  implementation "com.facebook.react:react-native:+"
}
```

7.  Update `.env` file with your Chatkit and Firebase credentials.

```
CHATKIT_INSTANCE_LOCATOR_ID="YOUR CHATKIT APP INSTANCE (omit v1:us1:)"
CHATKIT_SECRET_KEY="YOUR CHATKIT SECRET"
CHATKIT_WEBHOOK_SECRET="YOUR CHATKIT WEBHOOK SECRET"
FIREBASE_SENDER_ID="YOUR FIREBASE SENDER ID"
```

8.  Set up the server:

```
cd server
yarn
```

9.  Run the server:

```
yarn start
```

10. Set up room and users using the `/create-room` and `/create-and-assign-user` routes.

11. Expose the server to the internet using ngrok:

```
./ngrok http 5000
```

12. Update the `src/screens/Login.js`, `src/screens/Rooms.js`, and `src/screens/Chat.js` file with your ngrok HTTPS URL:

```
const CHAT_SERVER = "YOUR NGROK HTTPS URL";
```

## Built With

-   [React Native](http://facebook.github.io/react-native/)
-   [React Native Gifted Chat](https://github.com/FaridSafi/react-native-gifted-chat)
-   [React Native Push Notification](https://github.com/zo0r/react-native-push-notification)
-   [Chatkit](https://pusher.com/chatkit)
-   [Firebase](https://console.firebase.google.com)
