export const CHARACTERS = {
  timeout: { call: 20000, voice: 45000, create: 90000 },
  route: {
    list: "chars",
    lookup: "chars/lookup",
    voice: "chars/voice",
    publish: "chars/publish",
    create: "chars/create",
    remove: "chars/delete",
    chats: "chats",
    chat: "chats/get",
    dropChat: "chats/delete",
    stream: "chat/stream",
  },
};
