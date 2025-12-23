#!/bin/bash

PREFIX="backend_part"
MAX_SIZE=819200  # 800KB in bytes
TEMP_FILE="backend_temp.txt"
CURRENT_PART=1
CURRENT_SIZE=0

# Clear temp and old part files
rm -f "$TEMP_FILE" ${PREFIX}*.txt backend_full_code.txt

echo "Generating backend code files..."

# Function to add file content
add_file() {
    local filepath="$1"
    if [ -f "$filepath" ]; then
        local header=$'\n'"=== File: $filepath ==="$'\n\n'
        local content=$(cat "$filepath")
        local footer=$'\n'
        echo "${header}${content}${footer}" >> "$TEMP_FILE"
    fi
}

# Add package.json (root only, no lock files)
add_file "package.json"

# Add drizzle config if exists
add_file "drizzle.config.ts"

# Add shared/ folder (only .ts, .js files, no images)
if [ -d "shared" ]; then
    find shared/ -type f \( -name "*.ts" -o -name "*.js" \) | sort | while read file; do
        add_file "$file"
    done
fi

# Add drizzle/ folder if exists
if [ -d "drizzle" ]; then
    find drizzle/ -type f \( -name "*.ts" -o -name "*.js" -o -name "*.sql" \) | sort | while read file; do
        add_file "$file"
    done
fi

# Add server/ folder (only .ts, .js files, exclude seed json to reduce size)
if [ -d "server" ]; then
    find server/ -type f \( -name "*.ts" -o -name "*.js" \) ! -path "*/node_modules/*" | sort | while read file; do
        add_file "$file"
    done
fi

# Check total size
TOTAL_SIZE=$(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE" 2>/dev/null)

if [ "$TOTAL_SIZE" -le "$MAX_SIZE" ]; then
    # No need to split
    mv "$TEMP_FILE" "backend_full_code.txt"
    echo "✅ Generated: backend_full_code.txt ($(echo "scale=2; $TOTAL_SIZE/1024" | bc)KB)"
else
    # Need to split
    echo "File exceeds 800KB, splitting..."
    
    CURRENT_FILE="${PREFIX}${CURRENT_PART}.txt"
    > "$CURRENT_FILE"
    
    while IFS= read -r line; do
        echo "$line" >> "$CURRENT_FILE"
        CURRENT_SIZE=$(stat -f%z "$CURRENT_FILE" 2>/dev/null || stat -c%s "$CURRENT_FILE" 2>/dev/null)
        
        # Check if we hit a file boundary and need to split
        if [ "$CURRENT_SIZE" -ge "$MAX_SIZE" ]; then
            if [[ "$line" == "=== File:"* ]]; then
                # Remove last line (new file header) from current part
                head -n -1 "$CURRENT_FILE" > "${CURRENT_FILE}.tmp"
                mv "${CURRENT_FILE}.tmp" "$CURRENT_FILE"
                
                # Start new part with the file header
                CURRENT_PART=$((CURRENT_PART + 1))
                CURRENT_FILE="${PREFIX}${CURRENT_PART}.txt"
                echo "$line" > "$CURRENT_FILE"
            fi
        fi
    done < "$TEMP_FILE"
    
    rm -f "$TEMP_FILE"
    
    echo "✅ Split into $CURRENT_PART parts:"
    for f in ${PREFIX}*.txt; do
        size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)
        echo "   - $f ($(echo "scale=2; $size/1024" | bc)KB)"
    done
fi

echo ""
echo "Files included:"
grep "^=== File:" ${PREFIX}*.txt backend_full_code.txt 2>/dev/null | wc -l | xargs echo "Total files:"
