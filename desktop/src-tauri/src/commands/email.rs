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

        "linux" => Command::new("xdg-email")
            .args([
                "--attach",
                attachment.as_str(),
                "--subject",
                subject.as_str(),
                "--body",
                body.as_str(),
                to.as_str(),
            ])
            .output()
            .map_err(|e| e.to_string())
            .and_then(|out| {
                if out.status.success() {
                    Ok(())
                } else {
                    Err(String::from_utf8_lossy(&out.stderr).to_string())
                }
            }),

        "windows" => {
            let mailto = format!(
                "mailto:{}?subject={}&body={}",
                urlencoding::encode(&to),
                urlencoding::encode(&subject),
                urlencoding::encode(&body)
            );
            let result = Command::new("cmd")
                .args(["/c", "start", "", mailto.as_str()])
                .output()
                .map_err(|e| e.to_string())
                .and_then(|out| {
                    if out.status.success() {
                        Ok(())
                    } else {
                        Err(String::from_utf8_lossy(&out.stderr).to_string())
                    }
                });

            let clip = format!(
                "Set-Clipboard -Value '{}'",
                attachment.replace('\\', "\\\\").replace('\'', "''")
            );
            let _ = Command::new("powershell")
                .args(["-NoProfile", "-Command", clip.as_str()])
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
