#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VERTEX (Megatextile) - Telegram Bot с Mini App
===============================================
Бот для магазина премиальных мебельных тканей из Китая и Турции.
Внутри встроен Telegram Mini App (Web App) с каталогом, свайпом фото,
оформлением заказов и панелью управления для администраторов.

Работает автономно без сторонних зависимостей (стандартная библиотека Python 3).
"""

import sys
import os
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Dict, Any, List, Optional

# ==================== КОНФИГУРАЦИЯ БОТА ====================
BOT_TOKEN = os.getenv("BOT_TOKEN", "9161284109:AAE8SUu044PLoFJLGirCWhTqAzlptuAlvk0")

# URL вашего опубликованного сайта (GitHub Pages):
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://user97455.github.io/-----------/")

# URL базы данных Supabase и Anon Key:
SUPABASE_URL = "https://kprtyjclotfyeldopfyc.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_2ZEud2o7XD3xuvrWqX7Zpg_bMyPIqDr"

# Контакты менеджера:
MANAGER_PHONE = "+7 (928) 882-30-54"
MANAGER_WHATSAPP = "https://wa.me/79288823054"

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


def telegram_api(method: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Выполняет запрос к Telegram Bot API."""
    url = f"{API_BASE}/{method}"
    headers = {"Content-Type": "application/json"}
    payload = json.dumps(data or {}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"[API Error] {method}: {e.code} - {err_body}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[Network Error] {method}: {e}", file=sys.stderr)
        return None


def setup_menu_button():
    """Устанавливает постоянную кнопку 'Каталог тканей' в левом нижнем углу чата."""
    data = {
        "menu_button": {
            "type": "web_app",
            "text": "🧵 Каталог тканей",
            "web_app": {"url": WEB_APP_URL}
        }
    }
    telegram_api("setChatMenuButton", data)


def get_telegram_admins() -> List[str]:
    """Загружает список Telegram-администраторов из Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/site_settings?key=eq.telegram_admins&select=value"
    headers = {"apikey": SUPABASE_ANON_KEY}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                raw_val = data[0].get("value", "[]")
                return json.loads(raw_val)
    except Exception as e:
        print(f"Error fetching tg admins: {e}")
    return ["User97455"]


def save_telegram_admin(username: str) -> bool:
    """Добавляет нового Telegram-администратора в Supabase."""
    clean_username = username.strip().replace("@", "")
    current_admins = get_telegram_admins()
    if clean_username.lower() not in [a.lower() for a in current_admins]:
        current_admins.append(clean_username)
    url = f"{SUPABASE_URL}/rest/v1/site_settings"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    payload = json.dumps({"key": "telegram_admins", "value": json.dumps(current_admins)}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201, 204)
    except Exception as e:
        print(f"Error saving tg admin: {e}")
        return False


def send_welcome_message(chat_id: int, user_info: Dict[str, Any]):
    """Отправляет красивое приветственное сообщение со встроенным Mini App."""
    first_name = user_info.get("first_name", "друг")
    username = (user_info.get("username") or "").lower()
    admins = [a.lower() for a in get_telegram_admins()]
    is_admin = username in admins

    text = (
        f"Здравствуйте, <b>{first_name}</b>! ✨\n\n"
        f"Добро пожаловать в салон мебельных тканей <b>VERTEX (Megatextile)</b>.\n"
        f"Прямые оптово-розничные поставки из <b>Китая и Турции</b> 🇨🇳 🇹🇷\n\n"
        f"▫️ <b>Ассортимент:</b> Велюр, Жаккард, Шенилл, Рогожка, Кожа, Однотонка, Пано\n"
        f"▫️ <b>Стойкость к износу:</b> до 80 000+ циклов Мартиндейла\n"
        f"▫️ <b>Доставка:</b> по всему Кавказу, в рулонах и нарезкой\n\n"
        f"Нажмите кнопку ниже, чтобы открыть наш интерактивный каталог тканей прямо в Telegram 👇"
    )

    admin_badge = "\n\n⭐️ <i>Вы авторизованы как администратор. Вам доступно редактирование каталога!</i>" if is_admin else ""
    text += admin_badge

    admin_url = f"{WEB_APP_URL}?view=admin"
    share_admin_url = f"{WEB_APP_URL}?admin_key=vertex_admin_7799"

    inline_keyboard = [
        [
            {
                "text": "🧵 Открыть каталог тканей (Mini App)",
                "web_app": {"url": WEB_APP_URL}
            }
        ],
        [
            {
                "text": "💬 Заказать в WhatsApp",
                "url": MANAGER_WHATSAPP
            },
            {
                "text": "📞 Позвонить",
                "url": f"tel:{MANAGER_PHONE.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')}"
            }
        ]
    ]

    if is_admin:
        inline_keyboard.append([
            {
                "text": "⚙️ Панель управления (Админ)",
                "web_app": {"url": admin_url}
            },
            {
                "text": "👥 Поделиться правами админа",
                "url": f"https://t.me/share/url?url={urllib.parse.quote(share_admin_url)}&text={urllib.parse.quote('Вот ссылка с правами администратора каталога тканей VERTEX:')}"
            }
        ])

    data = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": inline_keyboard
        }
    }
    telegram_api("sendMessage", data)


def handle_admin_command(chat_id: int, user_info: Dict[str, Any], args: str):
    """Обработка команд администрирования и назначения прав."""
    username = (user_info.get("username") or "").lower()
    admins = [a.lower() for a in get_telegram_admins()]

    if username not in admins and "user97455" not in admins:
        telegram_api("sendMessage", {
            "chat_id": chat_id,
            "text": "⚠️ У вас нет прав администратора. Попросите действующего владельца выдать вам доступ через команду <code>/add_admin @ваш_username</code>.",
            "parse_mode": "HTML"
        })
        return

    # Добавление нового администратора: /add_admin @username
    if args:
        target = args.strip()
        success = save_telegram_admin(target)
        if success:
            telegram_api("sendMessage", {
                "chat_id": chat_id,
                "text": f"✅ Пользователь <b>{target}</b> успешно назначен администратором!\n\nТеперь он может открывать Mini App с полными правами редактирования товаров и категорий.",
                "parse_mode": "HTML"
            })
        else:
            telegram_api("sendMessage", {
                "chat_id": chat_id,
                "text": "❌ Не удалось сохранить администратора в базе данных. Попробуйте еще раз.",
                "parse_mode": "HTML"
            })
        return

    # Показ списка и панели
    current_list = "\n".join([f"• @{a}" for a in get_telegram_admins()])
    admin_link = f"{WEB_APP_URL}?admin_key=vertex_admin_7799"
    text = (
        f"👑 <b>Панель управления администраторов</b>\n\n"
        f"<b>Текущие администраторы:</b>\n{current_list}\n\n"
        f"▫️ <b>Добавить администратора:</b>\nОтправьте команду <code>/add_admin @username</code>\n\n"
        f"▫️ <b>Секретная ссылка для доступа в 1 клик:</b>\n<code>{admin_link}</code>\n"
        f"<i>(Любой, кто перейдет по этой ссылке, сразу получает доступ к редактированию сайта и каталога)</i>"
    )
    telegram_api("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": [
                [
                    {
                        "text": "⚙️ Открыть панель управления",
                        "web_app": {"url": f"{WEB_APP_URL}?view=admin"}
                    }
                ],
                [
                    {
                        "text": "↗️ Поделиться доступом в Telegram",
                        "url": f"https://t.me/share/url?url={urllib.parse.quote(admin_link)}&text={urllib.parse.quote('Ссылка с правами администратора каталога тканей VERTEX:')}"
                    }
                ]
            ]
        }
    })


def handle_web_app_data(chat_id: int, user_info: Dict[str, Any], web_app_data: Dict[str, Any]):
    """Обрабатывает заказы и данные, отправленные из Mini App."""
    data_str = web_app_data.get("data", "{}")
    try:
        payload = json.loads(data_str)
    except Exception:
        payload = {"text": data_str}

    fabric_name = payload.get("name", "Ткань")
    category = payload.get("category", "")
    price = payload.get("price", "")

    first_name = user_info.get("first_name", "")
    username = f"@{user_info.get('username')}" if user_info.get("username") else f"ID: {user_info.get('id')}"

    text = (
        f"🎉 <b>Спасибо за заказ!</b>\n\n"
        f"Вы выбрали: <b>{fabric_name}</b> ({category})\n"
        f"Цена: <b>{price} ₽ / м.</b>\n\n"
        f"Менеджер свяжется с вами в ближайшее время для подтверждения метража и адреса доставки.\n"
        f"Вы также можете написать напрямую в WhatsApp: <a href='{MANAGER_WHATSAPP}'>{MANAGER_PHONE}</a>"
    )
    telegram_api("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    })


def run_bot():
    """Основной цикл опроса (Long Polling)."""
    if BOT_TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE" or not BOT_TOKEN:
        print("\n" + "=" * 60)
        print("⚠️  ВНИМАНИЕ: Не указан токен Telegram-бота!")
        print("1. Напишите @BotFather в Telegram и создайте бота командой /newbot.")
        print("2. Скопируйте полученный HTTP API токен.")
        print("3. Вставьте его в переменную BOT_TOKEN в файле bot.py или запустите:")
        print("   BOT_TOKEN='ваш_токен' python3 bot.py")
        print("=" * 60 + "\n")
        return

    print("Проверка подключения к Telegram Bot API...")
    me = telegram_api("getMe")
    if not me or not me.get("ok"):
        print(f"❌ Ошибка подключения: проверьте правильность BOT_TOKEN: {BOT_TOKEN}")
        return

    bot_user = me["result"]
    print(f"✅ Бот успешно запущен: @{bot_user['username']} ({bot_user['first_name']})")
    print(f"🔗 Привязанный Web App URL: {WEB_APP_URL}")

    setup_menu_button()
    print("✅ Кнопка меню 'Каталог тканей' настроена.")

    offset = 0
    print("🚀 Бот слушает сообщения (нажмите Ctrl+C для остановки)...")

    while True:
        try:
            updates = telegram_api("getUpdates", {"offset": offset, "timeout": 25})
            if not updates or not updates.get("ok"):
                time.sleep(2)
                continue

            for update in updates.get("result", []):
                offset = update["update_id"] + 1

                message = update.get("message")
                if not message:
                    continue

                chat_id = message["chat"]["id"]
                user_info = message.get("from", {})
                text = (message.get("text") or "").strip()

                # Проверка данных из Mini App
                if "web_app_data" in message:
                    handle_web_app_data(chat_id, user_info, message["web_app_data"])
                    continue

                # Команды
                if text.startswith("/start"):
                    send_welcome_message(chat_id, user_info)
                elif text.startswith("/catalog"):
                    telegram_api("sendMessage", {
                        "chat_id": chat_id,
                        "text": "Нажмите на кнопку ниже, чтобы открыть каталог тканей:",
                        "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "🧵 Открыть каталог тканей",
                                "web_app": {"url": WEB_APP_URL}
                            }]]
                        }
                    })
                elif text.startswith("/admin") or text.startswith("/admins"):
                    handle_admin_command(chat_id, user_info, "")
                elif text.startswith("/add_admin") or text.startswith("/grant_admin"):
                    parts = text.split(maxsplit=1)
                    arg = parts[1] if len(parts) > 1 else ""
                    handle_admin_command(chat_id, user_info, arg)
                elif text:
                    # На любой текст отправляем приветствие с каталогом
                    send_welcome_message(chat_id, user_info)

        except KeyboardInterrupt:
            print("\nБот остановлен пользователем.")
            break
        except Exception as e:
            print(f"Loop error: {e}")
            time.sleep(3)


if __name__ == "__main__":
    run_bot()
