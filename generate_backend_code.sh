#!/bin/bash

OUTPUT_FILE="backend_full_code.txt"

# Clear or create the output file
> "$OUTPUT_FILE"

echo "Generating $OUTPUT_FILE..."

# Function to add file content with header
add_file() {
    local filepath="$1"
    if [ -f "$filepath" ]; then
        echo "" >> "$OUTPUT_FILE"
        echo "=== File: $filepath ===" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        cat "$filepath" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
}

# Add root config files
add_file "package.json"
add_file "drizzle.config.ts"

# Add all files in shared/ folder
find shared/ -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) | sort | while read file; do
    add_file "$file"
done

# Add all files in server/ folder
find server/ -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" \) | sort | while read file; do
    add_file "$file"
done

# Count lines and files
total_lines=$(wc -l < "$OUTPUT_FILE")
total_files=$(grep -c "^=== File:" "$OUTPUT_FILE")

echo ""
echo "✅ Done! Generated: $OUTPUT_FILE"
echo "   Total files: $total_files"
echo "   Total lines: $total_lines"
