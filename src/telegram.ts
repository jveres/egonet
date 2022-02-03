// Copyright 2022 Janos Veres. All rights reserved.
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file.

export class Telegram {
  static chatId: string;
  static token: string;

  static setCredentials({ chatId, token }: { chatId: string; token: string }) {
    Telegram.chatId = chatId;
    Telegram.token = token;
  }

  static sendMessage(text: string) {
    if (!Telegram.chatId || !Telegram.token) return;
    return fetch(
      `https://api.telegram.org/bot${Telegram.token}/sendMessage?chat_id=${Telegram.chatId}&text=${text}`,
    );
  }
}

const TELEGRAM = Deno.env.get("TELEGRAM");

if (TELEGRAM) {
  Telegram.setCredentials({
    chatId: TELEGRAM.split("#")[0],
    token: TELEGRAM.split("#")[1],
  });
  console.info("Telegram notification configured");
} else {
  console.warn("No Telegram credentials found");
}
