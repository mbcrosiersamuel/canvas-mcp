# Canvas Assignment Assistant MCP Server

## Overview

This Model Context Protocol (MCP) server lets you interact with Canvas/Instructure courses and assignments, without leaving your LLM (e.g. Claude Desktop).

It allows you to retrieve, search, and summarize course and assignment information programmatically, for example to check due dates for upcoming assignments:

![Due Dates](images/due-dates.png)


## Features

### Tools

1. **List Courses**
   - Retrieve a list of courses
   - Filter by course state (active, completed, or all)

2. **Search Assignments**
   - Search across courses for assignments
   - Filter by:
     - Search query
     - Due date range
     - Specific course
     - Include/exclude completed courses

3. **Get Assignment Details**
   - Fetch detailed information about a specific assignment
   - Multiple output formats (full HTML, plain text, markdown)

### Resources

- **Assignment Content**: Retrieve full assignment details using a standardized URI format

## Prerequisites

- Node.js
- Canvas LMS account
- Canvas API Token
- Canvas Domain

## Environment Setup

Set the following environment variables:

- `CANVAS_API_TOKEN`: Your Canvas API access token (see instructions below)
- `CANVAS_DOMAIN`: Your Canvas institution's domain (e.g., `canvas.youruniversity.edu`)

#### How to Get Your Canvas API Token

1. Log into Canvas
2. Go to Account > Settings
3. Scroll to the "Approved Integrations" section
4. Click "New Access Token"
5. Copy the generated token

For more details, see [these instructions from Canvas](https://community.canvaslms.com/t5/Canvas-Basics-Guide/How-do-I-manage-API-access-tokens-in-my-user-account/ta-p/615312).

### Security Note

Keep your `CANVAS_API_TOKEN` confidential. Do not commit it to version control.

## Installation

1.  **Clone the repository and install dependencies**

  Clone the repository
 
   ```bash
   git clone https://github.com/mbcrosiersamuel/canvas-mcp.git
   cd canvas-mcp
   ```

   Install dependencies. If this throws an error, make sure you have [node installed](https://nodejs.org/en).

   ```bash
   npm install
   ```

2. **Connect to the MCP server**

   Copy the below json with the appropriate {{PATH}} values:

   ```json
   {
     "mcpServers": {
       "canvas": {
         "command": "node", 
         "args": ["/absolute/path/to/canvas-mcp/src/index.ts"], // cd into the src repo, run `pwd` and enter the output here
         "env": {
            "CANVAS_API_TOKEN": "your_api_token_here",
            "CANVAS_DOMAIN": "myschool.instructure.com"
          }
       }
     }
   }
   ```

   For **Claude**, save this as `claude_desktop_config.json` in your Claude Desktop configuration directory at:

   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```

   For **Cursor**, save this as `mcp.json` in your Cursor configuration directory at:

   ```
   ~/.cursor/mcp.json
   ```

3. **Restart Claude Desktop / Cursor**

   Open Claude Desktop and you should now see Canvas as an available integration.

   Or restart Cursor.


## MCP Tools
- `list_courses`: Shows all active courses by default. Use flags to show completed or all courses
- `search_assignments`: Searches assignment titles and descriptions
- `get_assignment`: Retrieves full assignment details

## Troubleshooting

### Common Issues

- **Token Invalid**: 
  - Regenerate your Canvas API token
  - Ensure token has appropriate permissions

- **Domain Incorrect**:
  - Double-check your Canvas institution domain
  - Verify there are no typos

## Disclaimer

This is an unofficial Canvas MCP, and is not affiliated with Canvas or Instructure. I'm also not a professional software engineer, and this project was vibe-coded using Claude, so please use it at your own risk :)

## Thanks!

- Thanks to [Luke Harries](https://github.com/lharries) for inspiration and for part of the text of this Readme.
- Thanks to the Anthropic team for [great instructions on how to use LLMs to create MCPs](https://modelcontextprotocol.io/tutorials/building-mcp-with-llms)!
