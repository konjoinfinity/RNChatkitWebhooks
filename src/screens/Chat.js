import React, { Component } from "react";
import { View, Text, ActivityIndicator, FlatList, TouchableOpacity, Alert } from "react-native";
import { GiftedChat, Send, Message } from "react-native-gifted-chat";
import { ChatManager, TokenProvider } from "@pusher/chatkit-client";
import Config from "react-native-config";
import Icon from "react-native-vector-icons/FontAwesome";
import { DocumentPicker, DocumentPickerUtil } from "react-native-document-picker";
import * as mime from "react-native-mime-types";
import Modal from "react-native-modal";
import RNFS from "react-native-fs";
import RNFetchBlob from "rn-fetch-blob";

const Blob = RNFetchBlob.polyfill.Blob;
const fs = RNFetchBlob.fs;
window.XMLHttpRequest = RNFetchBlob.polyfill.XMLHttpRequest;
window.Blob = Blob;

const CHATKIT_INSTANCE_LOCATOR_ID = `v1:us1:${Config.CHATKIT_INSTANCE_LOCATOR_ID}`;
const CHATKIT_SECRET_KEY = Config.CHATKIT_SECRET_KEY;

const CHAT_SERVER = "YOUR NGROK HTTPS URL";
const CHATKIT_TOKEN_PROVIDER_ENDPOINT = `${CHAT_SERVER}/auth`;

class Chat extends Component {

  static navigationOptions = ({ navigation }) => {
    const { params } = navigation.state;
    return {
      headerTitle: params.room_name,
      headerRight: (
        <View style={styles.header_right}>
          <TouchableOpacity style={styles.header_button_container} onPress={params.showUsersModal}>
            <View>
              <Text style={styles.header_button_text}>Users</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.header_button_container} onPress={params.leaveRoom}>
            <View style={styles.header_button}>
              <Text style={styles.header_button_text}>Leave Room</Text>
            </View>
          </TouchableOpacity>
        </View>

      ),
      headerStyle: {
        backgroundColor: "#333"
      },
      headerTitleStyle: {
        color: "#FFF"
      }
    };
  };

  //

  state = {
    room_users: null,
    messages: [],
    is_initialized: false,
    is_picking_file: false,

    is_users_modal_visible: false,

    is_typing: false,
    typing_user: null,
    show_load_earlier: false
  };


  constructor(props) {
    super(props);
    const { navigation } = this.props;

    this.user_id = navigation.getParam("user_id");
    this.room_id = navigation.getParam("room_id");

    this.modal_types = {
      users: 'is_users_modal_visible'
    };
  }

  
  leaveRoom = async () => {
    Alert.alert(
      'Leave Room',
      'Do you want to leave this room?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes', 
          onPress: async () => {
            try {
              await this.currentUser.leaveRoom({ roomId: this.room_id });
              
              this.currentUser.disconnect();
              this.props.navigation.goBack();
            } catch (leave_room_err) {
              console.log("error leaving room: ", leave_room_err);
            }
          }
        },
      ],
      {
        cancelable: false
      },
    );
  }

  //

  async componentDidMount() {
    this.props.navigation.setParams({
      showUsersModal: this.showUsersModal,
      leaveRoom: this.leaveRoom
    });

    try {
      const chatManager = new ChatManager({
        instanceLocator: CHATKIT_INSTANCE_LOCATOR_ID,
        userId: this.user_id,
        tokenProvider: new TokenProvider({ url: CHATKIT_TOKEN_PROVIDER_ENDPOINT })
      });

      let currentUser = await chatManager.connect();
      this.currentUser = currentUser;

      await this.currentUser.subscribeToRoomMultipart({
        roomId: this.room_id,
        hooks: {
          onMessage: this.onReceive,
          onUserStartedTyping: this.startTyping,
          onUserStoppedTyping: this.stopTyping,
          onUserLeft: this.userLeft,
          onUserJoined: this.userAdded,
          onPresenceChanged: this.userPresenceChanged
        }
      });

      await this.setState({
        is_initialized: true,
        room_users: this.currentUser.users
      });

    } catch (chat_mgr_err) {
      console.log("error with chat manager: ", chat_mgr_err);
    }
  }


  componentWillUnMount() {
    this.currentUser.disconnect();
  }


  userLeft = (user) => {
    const { room_users } = this.state;
    const index = room_users.findIndex((item) => item.id === user.id);
    const updated_users = [...room_users.slice(0, index), ...room_users.slice(index + 1)]

    this.setState({
      room_users: updated_users
    });
  }


  userAdded = (user) => {
    const { room_users } = this.state;
    const updated_users = room_users.concat([user]);

    this.setState({
      room_users: updated_users
    });
  }


  userPresenceChanged = (state, user) => {
    const { room_users } = this.state;
    if (room_users) {
      let users = [...room_users];

      const user_index = users.findIndex((item) => item.id === user.id);
      if (user_index !== -1) {
        users[user_index].presenceStore[user.id] = state.current;
        this.setState({
          room_users: users
        });
      }
    }
  }

  //

  onReceive = async (data) => {
    const { message } = await this.getMessage(data);
    await this.setState((previousState) => ({
      messages: GiftedChat.append(previousState.messages, message)
    }));

    if (this.state.messages.length > 9) {
      this.setState({
        show_load_earlier: true
      });
    }
  }


  onSend = async ([message]) => {
    let message_parts = [
      { type: "text/plain", content: message.text }
    ];

    if (this.attachment) {
      const { file_blob, file_name, file_type } = this.attachment;
      message_parts.push({
        file: file_blob,
        name: file_name,
        type: file_type
      });
    }

    this.setState({
      is_sending: true
    });

    try {
      await this.currentUser.sendMultipartMessage({
        roomId: this.room_id,
        parts: message_parts
      });

      this.attachment = null;
      await this.setState({
        is_sending: false
      });
    } catch (send_msg_err) {
      console.log("error sending message: ", send_msg_err);
    }
  }


  renderSend = props => {
    if (this.state.is_sending) {
      return (
        <ActivityIndicator
          size="small"
          color="#0064e1"
          style={[styles.loader, styles.sendLoader]}
        />
      );
    }

    return <Send {...props} />;
  }


  getMessage = async ({ id, sender, parts, createdAt }) => {
    const text = parts.find(part => part.partType === 'inline').payload.content;
    const attachment = parts.find(part => part.partType === 'attachment');

    const attachment_url = (attachment) ? await attachment.payload.url() : null;
    const attachment_type = (attachment) ? attachment.payload.type : null;

    const msg_data = {
      _id: id,
      text: text,
      createdAt: new Date(createdAt),
      user: {
        _id: sender.id,
        name: sender.name,
        avatar: sender.avatarURL
      }
    };

    if (attachment) {
      Object.assign(msg_data, { attachment: { url: attachment_url, type: attachment_type } });
    }

    if (attachment && attachment_type.indexOf('image') !== -1) {
      Object.assign(msg_data, { image: attachment_url });
    }

    return {
      message: msg_data
    };
  }


  asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  };

  //

  render() {

    const {
      is_initialized,
      room_users,
      messages,
      is_users_modal_visible,
      show_load_earlier,
      typing_user
    } = this.state;

    return (

      <View style={styles.container}>
        {(!is_initialized) && (
          <ActivityIndicator
            size="small"
            color="#0064e1"
            style={styles.loader}
          />
        )}

        {is_initialized && (
          <GiftedChat
            messages={messages}
            onSend={messages => this.onSend(messages)}
            user={{
              _id: this.user_id
            }}
            renderActions={this.renderCustomActions}
            renderSend={this.renderSend}
            onInputTextChanged={this.onTyping}
            renderFooter={this.renderFooter}
            extraData={{ typing_user }}

            loadEarlier={show_load_earlier}
            onLoadEarlier={this.loadEarlierMessages}
          />
        )}

        {
          room_users &&
          <Modal isVisible={is_users_modal_visible}>
            <View style={styles.modal}>
              <View style={styles.modal_header}>
                <Text style={styles.modal_header_text}>Users</Text>
                <TouchableOpacity onPress={this.hideModal.bind(this, 'users')}>
                  <Icon name={"close"} size={20} color={"#565656"} style={styles.close} />
                </TouchableOpacity>
              </View>

              <View style={styles.modal_body}>
                <FlatList
                  keyExtractor={item => item.id.toString()}
                  data={room_users}
                  renderItem={this.renderUser}
                />
              </View>
            </View>
          </Modal>
        }
      </View>
    );
  }


  renderCustomActions = () => {
    if (!this.state.is_picking_file) {
      const icon_color = this.attachment ? "#0064e1" : "#808080";
      return (
        <View style={styles.customActionsContainer}>
          <TouchableOpacity onPress={this.openFilePicker}>
            <View style={styles.buttonContainer}>
              <Icon name="paperclip" size={23} color={icon_color} />
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ActivityIndicator size="small" color="#0064e1" style={styles.loader} />
    );
  }
  //


  renderFooter = () => {
    const { is_typing, typing_user } = this.state;
    if (is_typing) {
      return (
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>
            {typing_user} is typing...
          </Text>
        </View>
      );
    }
    return null;
  }


  stopTyping = (user) => {
    this.setState({
      is_typing: false,
      typing_user: null
    });
  }


  startTyping = (user) => {
    this.setState({
      is_typing: true,
      typing_user: user.name
    });
  }


  onTyping = async () => {
    try {
      await this.currentUser.isTypingIn({ roomId: this.room_id });
    } catch (typing_err) {
      console.log("error setting is typing: ", typing_err);
    }
  }


  openFilePicker = async () => {
    await this.setState({
      is_picking_file: true
    });

    DocumentPicker.show({
      filetype: [DocumentPickerUtil.images()],
    }, async (err, file) => {
      if (!err) {

        try {
          const file_type = mime.contentType(file.fileName);
          const base64 = await RNFS.readFile(file.uri, "base64");

          const file_blob = await Blob.build(base64, { type: `${file_type};BASE64` });

          this.attachment = {
            file_blob: file_blob,
            file_name: file.fileName,
            file_type: file_type
          };

          Alert.alert("Success", "File attached!");

        } catch (attach_err) {
          console.log("error attaching file: ", attach_err);
        }

      }

      this.setState({
        is_picking_file: false
      });
    });
  }


  showUsersModal = () => {
    this.setState({
      is_users_modal_visible: true
    });
  }


  hideModal = (type) => {
    const modal = this.modal_types[type];
    this.setState({
      [modal]: false
    });
  }


  renderUser = ({ item }) => {
    const online_status = item.presenceStore[item.id];

    return (
      <View style={styles.list_item_body}>
        <View style={styles.list_item}>
          <View style={styles.inline_contents}>
            <View style={[styles.status_indicator, styles[online_status]]}></View>
            <Text style={styles.list_item_text}>{item.name}</Text>
          </View>
        </View>
      </View>
    );
  }

  //

  loadEarlierMessages = async () => {
    this.setState({
      is_loading: true
    });

    const earliest_message_id = Math.min(
      ...this.state.messages.map(m => parseInt(m._id))
    );

    try {
      let messages = await this.currentUser.fetchMultipartMessages({
        roomId: this.room_id,
        initialId: earliest_message_id,
        direction: "older",
        limit: 10
      });

      if (!messages.length) {
        this.setState({
          show_load_earlier: false
        });
      }

      let earlier_messages = [];
      await this.asyncForEach(messages, async (msg) => {
        let { message } = await this.getMessage(msg);
        earlier_messages.push(message);
      });

      await this.setState(previousState => ({
        messages: previousState.messages.concat(earlier_messages)
      }));
    } catch (err) {
      console.log("error occured while trying to load older messages", err);
    }

    await this.setState({
      is_loading: false
    });
  }

}


const styles = {
  container: {
    flex: 1
  },
  loader: {
    paddingTop: 20
  },

  header_right: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around"
  },
  header_button_container: {
    marginRight: 10
  },
  header_button_text: {
    color: '#FFF'
  },

  sendLoader: {
    marginRight: 10,
    marginBottom: 10
  },
  customActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  buttonContainer: {
    padding: 10
  },
  modal: {
    flex: 1,
    backgroundColor: '#FFF'
  },
  close: {
    alignSelf: 'flex-end',
    marginBottom: 10
  },
  modal_header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10
  },
  modal_header_text: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  modal_body: {
    marginTop: 20,
    padding: 20
  },
  centered: {
    alignItems: 'center'
  },
  list_item_body: {
    flex: 1,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  list_item: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  list_item_text: {
    marginLeft: 10,
    fontSize: 20,
  },
  inline_contents: {
    flex: 1,
    flexDirection: 'row'
  },
  status_indicator: {
    width: 10,
    height: 10,
    alignSelf: 'center',
    borderRadius: 10,
  },
  online: {
    backgroundColor: '#5bb90b'
  },
  offline: {
    backgroundColor: '#606060'
  },

  footerContainer: {
    marginTop: 5,
    marginLeft: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#aaa',
  },
  label: {
    fontSize: 16
  }
}

export default Chat;