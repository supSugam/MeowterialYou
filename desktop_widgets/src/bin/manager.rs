use std::process::{Command, Child};
use std::thread;
use std::time::Duration;

fn main() {
    println!("MeowterialYou Rust Widget Manager starting...");

    // Define widgets to start
    // In a future version, this could be read from a config file.
    let widgets = vec![
        "media_widget",
    ];

    let mut children: Vec<Child> = Vec::new();

    for widget in widgets {
        println!("Starting widget: {}", widget);
        
        // Try explicit paths
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let paths = [
            // 1. Installed location
            format!("{}/.local/bin/{}", home, widget),
            // 2. Relative to executable (if in same dir)
            format!("./{}", widget),
            // 3. Workspace dev paths
            format!("./target/release/{}", widget),
            format!("../../../../target/release/{}", widget),
            // 4. PATH lookup
            widget.to_string(),
        ];

        let mut child_started = false;
        for path in paths {
            match Command::new(&path).spawn() {
                Ok(c) => {
                    children.push(c);
                    child_started = true;
                    println!("Started {} from {}", widget, path);
                    break;
                }
                Err(_) => continue,
            }
        }

        if !child_started {
            eprintln!("Failed to start widget {}: Could not find binary", widget);
        }
    }

    println!("Managed widgets are running. Press Ctrl+C to stop all.");

    // Keep the manager alive and wait for children
    loop {
        thread::sleep(Duration::from_secs(1));
        
        // Simple health check: if all children are gone, exit?
        // Or just wait.
    }
}
