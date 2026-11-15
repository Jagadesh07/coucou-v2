// « OK Coucou »'s brain: Claude with the user's key and Coucou's tools —
// pills, music, the user's own data, opening an app, preparing an email (the
// mail app opens with it filled in; the user sends it) and Anthropic's web
// search. The conversation lives in memory only and is forgotten 90 s after
// the last turn. Port of ClaudeVoiceBrain.swift.

use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

const FAST_MODEL: &str = "claude-haiku-4-5";
const FORGET_AFTER: Duration = Duration::from_secs(90);

pub struct Brain {
    messages: Vec<Value>,
    last: Instant,
}

impl Default for Brain {
    fn default() -> Self {
        Self { messages: Vec::new(), last: Instant::now() }
    }
}

pub struct Reply {
    pub text: String,
    pub acted: bool,
}

fn tools() -> Vec<Value> {
    vec![
        json!({
            "name": "pills",
            "description": "Add, remove, set as main or list the pills shown in the island at the top of the screen. At most 4 pills besides the main one: remove one first if needed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": { "type": "string", "enum": ["add", "remove", "set_main", "list"] },
                    "names": { "type": "array", "items": { "type": "string" }, "description": "Pill names as listed (e.g. Stripe, GitHub, Cursor). Empty for list." }
                },
                "required": ["action"]
            }
        }),
        json!({
            "name": "music",
            "description": "Control Spotify: play or pause, next, previous, set the volume, or search a song, an artist or a playlist in Spotify.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": { "type": "string", "enum": ["play_pause", "next", "previous", "set_volume", "search"] },
                    "query": { "type": "string", "description": "What to search, for search." },
                    "volume": { "type": "integer", "description": "0-100 for set_volume." }
                },
                "required": ["action"]
            }
        }),
        json!({
            "name": "service_info",
            "description": "Read the user's real data that Coucou already has, as JSON: the active pills, the agent sessions (Claude Code, Codex…) and what they are doing, Claude or Codex plan usage, Spotify now playing, and the services' latest data (Stripe, GitHub, Vercel, Resend, n8n, Notion, Cal.com).",
            "input_schema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "open_app",
            "description": "Open an app on this computer by name (Firefox, VS Code, Notion, Spotify…).",
            "input_schema": { "type": "object", "properties": { "name": { "type": "string" } }, "required": ["name"] }
        }),
        json!({
            "name": "prepare_email",
            "description": "Open the user's mail app with an email filled in, for them to check and send (it is never sent automatically). The recipient must be an email address.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "recipient": { "type": "string", "description": "An email address." },
                    "subject": { "type": "string" },
                    "body": { "type": "string", "description": "The full email text, written for the user." }
                },
                "required": ["recipient", "subject", "body"]
            }
        }),
        json!({ "type": "web_search_20250305", "name": "web_search", "max_uses": 3 }),
    ]
}

fn system_prompt(pills: &str) -> String {
    let t = crate::platform::local_time();
    let os = if cfg!(windows) { "Windows" } else { "Linux" };
    format!(
        "You are Coucou, a voice assistant living at the top of the screen of the user's {os} computer, a bit like Jarvis: \
quick, warm, a little playful. It is {:04}-{:02}-{:02} {:02}:{:02}.\n\
Everything you write is read aloud: answer in the language the user spoke, in one or two short sentences, \
no markdown, no lists, no emojis, no links.\n\
Act with the tools instead of describing: pills, music, service_info for the user's own data, open_app, \
prepare_email, and web_search for anything current (weather, news, scores, prices, facts you are not sure of). \
Never invent the user's data.\n\
Email: gather the recipient's address, the subject and what to say (write the text yourself from what the user \
wants to say, in the language they used), asking for what is missing one short question at a time, then call \
prepare_email. The email is never sent by you: the user checks it in their mail app and sends it.\n\
When you need an answer from the user, end with one short question. Otherwise never end with a question.\n\
Pills: {pills}",
        t.year, t.month, t.day, t.hour, t.minute
    )
}

async fn gemini_voice_turn(model: &str, system: &str, messages: &[Value], tools: &[Value]) -> Result<Value, String> {
    let key = crate::secrets::get("google-api-key").ok_or_else(|| "Google API key missing".to_string())?;
    let endpoint = reqwest::Url::parse("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions").map_err(|e| e.to_string())?;
    let mut formatted_msgs = vec![json!({ "role": "system", "content": system })];
    for m in messages {
        let role = m["role"].as_str().unwrap_or("user");
        let content = &m["content"];
        if let Some(arr) = content.as_array() {
            let has_tool_result = arr.iter().any(|b| b["type"] == "tool_result");
            if has_tool_result {
                for b in arr {
                    if b["type"] == "tool_result" {
                        formatted_msgs.push(json!({
                            "role": "tool",
                            "tool_call_id": b["tool_use_id"].as_str().unwrap_or(""),
                            "content": b["content"].as_str().unwrap_or("")
                        }));
                    }
                }
                continue;
            }
            let mut text = String::new();
            let mut tool_calls = Vec::new();
            for b in arr {
                if b["type"] == "text" {
                    if let Some(t) = b["text"].as_str() { text.push_str(t); }
                } else if b["type"] == "tool_use" {
                    tool_calls.push(json!({
                        "id": b["id"].as_str().unwrap_or(""),
                        "type": "function",
                        "function": {
                            "name": b["name"].as_str().unwrap_or(""),
                            "arguments": serde_json::to_string(&b["input"]).unwrap_or_else(|_| "{}".to_string())
                        }
                    }));
                }
            }
            if !tool_calls.is_empty() {
                formatted_msgs.push(json!({
                    "role": "assistant",
                    "content": if text.is_empty() { Value::Null } else { json!(text) },
                    "tool_calls": tool_calls
                }));
            } else {
                formatted_msgs.push(json!({ "role": role, "content": text }));
            }
        } else if let Some(s) = content.as_str() {
            formatted_msgs.push(json!({ "role": role, "content": s }));
        }
    }

    let mut function_tools = Vec::new();
    for t in tools {
        if let Some(name) = t["name"].as_str() {
            if let Some(schema) = t.get("input_schema") {
                function_tools.push(json!({
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": t["description"].as_str().unwrap_or(""),
                        "parameters": schema
                    }
                }));
            }
        }
    }

    let active_model = if model.is_empty() || model == "gemini-2.0-flash" {
        "gemini-3.8-flash"
    } else {
        model
    };

    let mut body = json!({
        "model": active_model,
        "messages": formatted_msgs,
        "max_tokens": 1024
    });
    if !function_tools.is_empty() {
        body["tools"] = json!(function_tools);
    }

    let response = crate::net::client(&endpoint, Duration::from_secs(45))?
        .post(endpoint)
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let err_body = crate::net::read_capped(response, crate::net::MAX_ERROR_BODY).await.unwrap_or_default();
        return Err(format!("Gemini API {status}: {}", crate::net::error_detail(&err_body)));
    }
    let bytes = crate::net::read_capped(response, crate::net::MAX_BODY).await?;
    let resp: Value = serde_json::from_slice(&bytes).map_err(|e| format!("Bad API response: {e}"))?;

    let choice = resp.pointer("/choices/0").ok_or_else(|| "No choices in response".to_string())?;
    let finish = choice["finish_reason"].as_str().unwrap_or("stop");
    let msg = &choice["message"];

    let mut content = Vec::new();
    if let Some(txt) = msg["content"].as_str() {
        if !txt.is_empty() {
            content.push(json!({ "type": "text", "text": txt }));
        }
    }
    if let Some(calls) = msg["tool_calls"].as_array() {
        for call in calls {
            let id = call["id"].as_str().unwrap_or("");
            let name = call.pointer("/function/name").and_then(Value::as_str).unwrap_or("");
            let raw_args = call.pointer("/function/arguments").and_then(Value::as_str).unwrap_or("{}");
            let input: Value = serde_json::from_str(raw_args).unwrap_or_else(|_| json!({}));
            content.push(json!({
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": input
            }));
        }
    }

    let stop_reason = if finish == "tool_calls" || content.iter().any(|b| b["type"] == "tool_use") {
        "tool_use"
    } else {
        "end_turn"
    };

    Ok(json!({
        "content": content,
        "stop_reason": stop_reason
    }))
}

impl Brain {
    pub fn respond(&mut self, app: &AppHandle, transcript: &str) -> Option<Reply> {
        if self.last.elapsed() > FORGET_AFTER {
            self.messages.clear();
        }
        self.last = Instant::now();
        self.messages.push(json!({ "role": "user", "content": transcript }));
        self.trim();
        let pills = super::ask_island(app, "pills", json!({ "action": "list" })).unwrap_or_default();
        let system = system_prompt(&pills);
        let tools = tools();
        let (chat_model, google_model) = app
            .try_state::<crate::Shared>()
            .map(|s| {
                let st = s.settings.lock().unwrap();
                let g = st.chat_models.get("google").cloned().unwrap_or_default();
                (st.model.clone(), g)
            })
            .unwrap_or_default();
        let mut acted = false;
        let mut spoken = String::new();
        let has_google = crate::secrets::present("google-api-key");
        for _ in 0..5 {
            let turn = tauri::async_runtime::block_on(async {
                if has_google {
                    let target = if !google_model.is_empty() && google_model != "gemini-2.0-flash" {
                        &google_model
                    } else if !chat_model.is_empty() && chat_model.contains("gemini") && chat_model != "gemini-2.0-flash" {
                        &chat_model
                    } else {
                        "gemini-3.8-flash"
                    };
                    match gemini_voice_turn(target, &system, &self.messages, &tools).await {
                        Ok(v) => Ok(v),
                        Err(err) => {
                            crate::log::line(format!("voice: gemini {target} failed: {err}; trying gemini-3.8-flash"));
                            gemini_voice_turn("gemini-3.8-flash", &system, &self.messages, &tools).await
                        }
                    }
                } else {
                    match crate::claude::voice_turn(FAST_MODEL, &system, &self.messages, &tools).await {
                        Ok(v) => Ok(v),
                        Err(err) if !chat_model.is_empty() => {
                            crate::log::line(format!("voice: {err}; the chat's model instead"));
                            crate::claude::voice_turn(&chat_model, &system, &self.messages, &tools).await
                        }
                        Err(err) => Err(err),
                    }
                }
            });
            let turn = match turn {
                Ok(t) => t,
                Err(err) => {
                    crate::log::line(format!("voice: assistant turn failed: {err}"));
                    if self.messages.last().is_some_and(|m| m["content"].is_string()) {
                        self.messages.pop();
                    }
                    return acted.then(|| Reply { text: String::new(), acted });
                }
            };
            let content = turn["content"].as_array().cloned().unwrap_or_default();
            self.messages.push(json!({ "role": "assistant", "content": content.clone() }));
            let text: String = content.iter().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join(" ");
            if !text.trim().is_empty() {
                spoken = text;
            }
            let stop = turn["stop_reason"].as_str().unwrap_or("end_turn");
            if stop == "pause_turn" {
                continue;
            }
            let uses: Vec<&Value> = content.iter().filter(|b| b["type"] == "tool_use").collect();
            if stop != "tool_use" || uses.is_empty() {
                break;
            }
            let mut results = Vec::new();
            for u in uses {
                let (result, did) = super::run_tool(app, u["name"].as_str().unwrap_or(""), &u["input"]);
                acted |= did;
                results.push(json!({ "type": "tool_result", "tool_use_id": u["id"], "content": result }));
            }
            self.messages.push(json!({ "role": "user", "content": results }));
            spoken.clear();
        }
        self.repair();
        Some(Reply { text: spoken_text(&spoken), acted })
    }

    /// Keeps the last exchanges, never cutting between a tool call and its result.
    fn trim(&mut self) {
        if self.messages.len() <= 24 {
            return;
        }
        let mut cut = self.messages.len() - 24;
        while cut < self.messages.len() && !(self.messages[cut]["role"] == "user" && self.messages[cut]["content"].is_string()) {
            cut += 1;
        }
        self.messages.drain(..cut.min(self.messages.len() - 1));
    }

    /// The API refuses a history ending on a tool call with no result after it.
    fn repair(&mut self) {
        let Some(last) = self.messages.last() else { return };
        if last["role"] != "assistant" {
            return;
        }
        let calls = last["content"].as_array().is_some_and(|c| c.iter().any(|b| b["type"] == "tool_use"));
        if calls {
            self.messages.pop();
        }
    }
}

/// What Claude wrote, ready to be said: citations and markdown left out.
pub fn spoken_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut skip = 0;
    for c in text.chars() {
        match c {
            '[' => skip += 1,
            ']' if skip > 0 => skip -= 1,
            '*' | '#' | '`' | '_' if skip == 0 => {}
            _ if skip == 0 => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_and_citations_are_not_read_aloud() {
        assert_eq!(spoken_text("**Done** — Stripe [1] is in the island."), "Done — Stripe is in the island.");
        assert_eq!(spoken_text("  Il fait  20 °C à Bordeaux. "), "Il fait 20 °C à Bordeaux.");
    }

    #[test]
    fn every_tool_has_a_schema() {
        for tool in tools() {
            assert!(tool["name"].is_string());
            assert!(tool.get("input_schema").is_some() || tool["type"] == "web_search_20250305");
        }
    }
}
