use std::process::Command;

#[tauri::command]
pub async fn print_file(path: String) -> Result<(), String> {
    let os = std::env::consts::OS;

    let result = match os {
        "macos" => Command::new("lpr")
            .args(["-o", "media=A4", path.as_str()])
            .output(),

        "linux" => {
            let lp = Command::new("lp").arg(&path).output();
            match lp {
                Ok(out) if out.status.success() => Ok(out),
                _ => Command::new("lpr").arg(&path).output(),
            }
        }

        "windows" => {
            let ps = format!(
                "Start-Process -FilePath '{}' -Verb print -Wait",
                path.replace('\\', "\\\\").replace('\'', "''")
            );
            Command::new("powershell")
                .args(["-NoProfile", "-Command", ps.as_str()])
                .output()
        }

        _ => return Err(format!("Silent print not supported on {}", os)),
    };

    result.map_err(|e| e.to_string()).and_then(|out| {
        if out.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            Err(format!("Print failed. stderr: {} stdout: {}", stderr, stdout))
        }
    })
}
