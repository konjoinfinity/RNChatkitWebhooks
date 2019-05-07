const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const Chatkit = require("@pusher/chatkit-server");

const crypto = require("crypto");
const admin = require("firebase-admin");
const randomId = require("random-id");

const serviceAccount = require("./config/rnchatkitwebhooks.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

require("dotenv").config();
const app = express();

const INSTANCE_LOCATOR_ID = process.env.CHATKIT_INSTANCE_LOCATOR_ID;
const CHATKIT_SECRET = process.env.CHATKIT_SECRET_KEY;
const CHATKIT_WEBHOOK_SECRET = process.env.CHATKIT_WEBHOOK_SECRET;

const chatkit = new Chatkit.default({
  instanceLocator: `v1:us1:${INSTANCE_LOCATOR_ID}`,
  key: CHATKIT_SECRET
});

const device_token = 'DEVICE REGISTRATION TOKEN OF YOUR TEST DEVICE';
app.use(cors());

app.use(
  bodyParser.text({
    type: (req) => {
      const contype = req.headers['content-type'];
      if (contype === 'application/json') {
        return true;
      }
      return false;
    },
  }),
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({
  type: (req) => {
    const contype = req.headers['content-type'];
    if (contype !== 'application/json') {
      return true;
    }
    return false;
  }
}));

const verifyRequest = (req) => {
  const signature = crypto
    .createHmac("sha1", WEBHOOK_SECRET)
    .update(req.body)
    .digest("hex")

  return signature === req.get("webhook-signature")
}

app.post("/auth", (req, res) => {
  const { user_id } = req.query;
  const authData = chatkit.authenticate({
    userId: user_id
  });

  res.status(authData.status)
     .send(authData.body);
});


app.post("/user", async (req, res) => {
  const { username } = req.body;
  try {
    const users = await chatkit.getUsers();
    const user = users.find((usr) => usr.name == username);
    res.send({ user });
  } catch (get_user_err) {
    console.log("error getting user: ", get_user_err);
  }
});


app.post("/rooms", async (req, res) => {
  const { user_id } = req.body;
  try {
    const rooms = await chatkit.getUserRooms({
      userId: user_id
    });
    rooms.map((item) => {
      item.joined = true;
      return item;
    });

    const joinable_rooms = await chatkit.getUserJoinableRooms({
      userId: user_id
    });
    joinable_rooms.map((item) => {
      item.joined = false;
      return item;
    });

    const all_rooms = rooms.concat(joinable_rooms);

    res.send({ rooms: all_rooms });
  } catch (get_rooms_err) {
    console.log("error getting rooms: ", get_rooms_err);
  }
});


app.post("/user/join", async (req, res) => {
  const { room_id, user_id } = req.body;
  try {
    await chatkit.addUsersToRoom({
      roomId: room_id,
      userIds: [user_id]
    });

    await chatkit.assignRoomRoleToUser({
      userId: user_id,
      name: 'new_room_member',
      roomId: room_id
    });

    res.send('ok');
  } catch (user_permissions_err) {
    console.log("error getting user permissions: ", user_permissions_err);
  }
});


app.get("/create-room/:name/:private", async (req, res) => {
  try {
    const { name, private } = req.params;
    const is_private = (private === 'true') ? true : false;
    const room = await chatkit.createRoom({
      creatorId: 'root',
      name: name,
      isPrivate: is_private
    });
    console.log(room.id);
    res.send("ok");
  } catch (err) {
    console.log("error creating room:", err);
    res.send("err");
  }
});

app.get("/create-and-assign-user/:username/:room_id", async (req, res) => {
  try {
    const { username, room_id } = req.params;
    const user_id = randomId(15);
    await chatkit.createUser({
      id: user_id,
      name: username,
      customData: {
        device_token: device_token
      }
    });

    await chatkit.addUsersToRoom({
      roomId: room_id,
      userIds: [user_id]
    });

    res.send("ok");
  } catch (err) {
    console.log("error creating and assigning user to room: ", err);
    res.send("err");
  }
});


const sendNotification = (title, body, device_token) => {
  const notification_payload = {
    notification: {
      title,
      body
    }
  };

  admin.messaging().sendToDevice(device_token, notification_payload)
    .then((response) => {
      console.log('sent notification!', response);
    })
    .catch((notify_err) => {
      console.log('notify err: ', notify_err);
    });
  
  console.log(title, body, device_token);
}

const shortMessage = (message) => {
  return message.substr(0, 37) + "...";
}

const sendNotificationToUsers = (users, title, body) => {
  if (users.length) {
    users.forEach((user) => {
      sendNotification(title, body, user.custom_data.device_token);
    });
  }
}

const getUsersById = async(user_ids) => {
  try {
    const users = await chatkit.getUsersById({
      userIds: user_ids
    });
    return users;
  } catch (err) {
    console.log("error getting users: ", err);
  }
}

const getRoom = async(room_id) => {
  try {
    const room = await chatkit.getRoom({
      roomId: room_id
    });
    return room;
  } catch (err) {
    console.log("error getting room: ", err);
  }
}

const getUser = async(user_id) => {
  try {
    const user = await chatkit.getUser({
      id: user_id,
    });
    return user;
  } catch (err) {
    console.log("error getting user: ", err);
  }
}

const notifyOfflineUsers = async({ payload }) => {
  const sender = payload.sender.name;
  const message = payload.message.parts[0].content;
  const short_message = shortMessage(message);
  const offline_user_ids = payload.offline_user_ids;
  
  try {
    const users = await getUsersById(offline_user_ids);
    sendNotificationToUsers(users, sender, short_message);
  } catch (err) {
    console.log("error notifying offline users: ", err);
  }
}

const notifyOnUserAddedToRoom = async({ payload }) => {
  const { id: room_id, name: room_name, private: is_private } = payload.room;
  const { id: user_id, name: user_name } = payload.users[0];
 
  if (is_private) {
    try {
      const room_data = await getRoom(room_id);
      const room_member_ids = room_data.member_user_ids.filter(id => id != user_id);
      const users = await getUsersById(room_member_ids);
      sendNotificationToUsers(users, 'system', `${user_name} joined ${room_name}`); 
    } catch (err) {
      console.log("error notifying user added to room: ", err);
    }
  }
}

const notifyOnUserLeftRoom = async({ payload }) => {
  const { id: room_id, name: room_name, private: is_private } = payload.room;
  const { id: user_id, name: user_name } = payload.user;
  if (is_private) {
    try {
      const room_data = await getRoom(room_id);
      const room_member_ids = room_data.member_user_ids.filter(id => id != user_id);
      const users = await getUsersById(room_member_ids);
      sendNotificationToUsers(users, 'system', `${user_name} left ${room_name}`); 
    } catch (err) {
      console.log("error notifying user left room: ", err);
    }    
  }
}

const notifyMentionedUsers = async({ payload }) => {
  try {
    const sender_id = payload.messages[0].user_id;
    const sender = await getUser(sender_id);

    const message = payload.messages[0].parts[0].content;
    const short_message = shortMessage(message);
    const room_id = payload.messages[0].room_id;

    const room_data = await getRoom(room_id);
    const room_members = await getUsersById(room_data.member_user_ids);
    const mentions = message.match(/@[a-zA-Z0-9]+/g) || [];
    
    const mentioned_users = room_members.filter((user) => {
      return mentions.indexOf(`@${user.name}`) !== -1;
    });

    sendNotificationToUsers(mentioned_users, sender.name, short_message); 
  } catch (err) {
    console.log("error notifying mentioned users: ", err);
  }
}


const notification_types = {
  'v1.message_sent_user_offline': notifyOfflineUsers,
  'v1.users_added_to_room': notifyOnUserAddedToRoom,
  'v1.user_left_room': notifyOnUserLeftRoom,
  'v1.messages_created': notifyMentionedUsers
}


app.post("/notify", (req, res) => {
  console.log("webhook triggered! ", req.body);
  if (verifyRequest(req)) {
    const data = JSON.parse(req.body);
    const type = data.metadata.event_type;
    notification_types[type](data);
    res.sendStatus(200);
  } else {
    console.log("Unverified request");
    res.sendStatus(401); // unauthorized
  }
});


const PORT = 5000;
app.listen(PORT, (err) => {
  if (err) {
    console.error(err);
  } else {
    console.log(`Running on ports ${PORT}`);
  }
});