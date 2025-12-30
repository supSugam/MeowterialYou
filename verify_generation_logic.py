import configparser
from src.util import Config

def test_logic():
    conf = configparser.ConfigParser()
    conf.read("example/config.ini")
    
    print("--- Verifying Generation Logic ---")
    for section in conf.sections():
        is_dark = Config._is_dark_theme(section)
        scheme_type = "DARK" if is_dark else "LIGHT"
        print(f"Section: [{section}] -> Detected as: {scheme_type}")
        template = conf[section].get("template_path")
        output = conf[section].get("output_path")
        print(f"  Template: {template}")
        print(f"  Output:   {output}")
        if is_dark and "dark" not in template.lower():
             print("  WARNING: Dark section using non-dark template?")
        if not is_dark and "dark" in template.lower():
             print("  WARNING: Light section using dark template?")

if __name__ == "__main__":
    test_logic()
