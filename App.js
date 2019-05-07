import React, { Component } from "react";
import { View } from "react-native";
import PushNotification from "react-native-push-notification";
import Config from "react-native-config";
const FIREBASE_SENDER_ID = Config.FIREBASE_SENDER_ID;

import Root from "./Root";

PushNotification.configure({
    senderID: FIREBASE_SENDER_ID,

    onRegister: function(token) {
      console.log('device registration token: ', token);
    },

    onNotification: function(notification) {
      console.log('notification: ', notification);
    },
    
    popInitialNotification: true,
    requestPermissions: true,
});

export default class App extends Component {

  render() {
    return (
      <View style={styles.container}>
        <Root />
      </View>
    );
  }
}

const styles = {
  container: {
    flex: 1
  }
};




