use std::process::Command;

#[tauri::command]
pub async fn compose_email(
    to: String,
    subject: String,
    body: String,
    attachment: String,
) -> Result<(), String> {
    let os = std::env::consts::OS;

    match os {
        "macos" => {
            let mailto = format!(
                "mailto:{}?subject={}&body={}&attach={}",
                urlencoding::encode(&to),
                urlencoding::encode(&subject),
                urlencoding::encode(&body),
                urlencoding::encode(&attachment)
            );
            Command::new("open")
                .arg(&mailto)
                .output()
                .map_err(|e| e.to_string())
                .and_then(|out| {
                    if out.status.success() {
                        Ok(())
                    } else {
                        Err(String::from_utf8_lossy(&out.stderr).to_string())
                    }
                })
        }

        "linux" => {
            Command::new("xdg-email")
                .args(&[
                    "--attach", &attachment,
                    "--subject", &subject,
                    "--body", &body,
                    &to,
                ])
                .output()
                .map_err(|e| e.to_string())
                .and_then(|out| {
                    if out.status.success() {
                        Ok(())
                    } else {
                        Err(String::from_utf8_lossy(&out.stderr).to_string())
                    }
                })
        }

        "windows" => {
            let mailto = format!(
                "mailto:{}?subject={}&body={}",
                urlencoding::encode(&to),
                urlencoding::encode(&subject),
                urlencoding::encode(&body)
            );
            let result = Command::new("cmd")
                .args(&["/c", "start", "", &mailto])
                .output()
                .map_err(|e| e.to_string())
                .and_then(|out| {
                    if out.status.success() {
                        Ok(())
                    } else {
                        Err(String::from_utf8_lossy(&out.stderr).to_string())
                    }
                });

            let _ = Command::new("powershell")
                .args(&[
                    "-NoProfile",
                    "-Command",
                    &format!(
                        "Set-Clipboard -Value '{}'",
                        attachment.replace('\\', "\\\\").replace('\'', "''")
                    ),
                ])
                .output();

            result.map_err(|e| {
                format!(
                    "{} (Note: on Windows please attach the file manually from: {})",
                    e, attachment
                )
            })
        }

        _ => Err(format!("Email composition not supported on {}", os)),
    }
}