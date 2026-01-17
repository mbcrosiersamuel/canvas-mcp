import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

// Create the MCP server
const server = new McpServer({
  name: "Canvas-Assignment-Assistant",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  }
});

// Load credentials from environment variables
let canvasApiToken: string | null = process.env.CANVAS_API_TOKEN || null;
let canvasDomain: string | null = process.env.CANVAS_DOMAIN || null;

// Define interfaces for API responses
interface CanvasUser {
  id: number;
  name: string;
  email: string;
}

interface CanvasCourse {
  id: number;
  name: string;
  term?: {
    name: string;
  };
}

interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number;
  submission_types: string[];
  allowed_extensions: string[] | null;
  allowed_attempts: number | null;
  grading_type: string;
  lock_at: string | null;
  unlock_at: string | null;
  has_group_assignment: boolean;
  group_category_id: number | null;
  peer_reviews: boolean;
  word_count: number | null;
  external_tool_tag_attributes?: {
    url: string;
    new_tab: boolean;
  };
  rubric: Array<{
    id: string;
    points: number;
    description: string;
    long_description: string | null;
  }> | null;
  use_rubric_for_grading: boolean;
  published: boolean;
  only_visible_to_overrides: boolean;
  locked_for_user: boolean;
  lock_explanation: string | null;
  turnitin_enabled: boolean;
  vericite_enabled: boolean;
  submission_draft_status?: string;
  annotatable_attachment_id?: number;
  anonymize_students: boolean;
  require_lockdown_browser: boolean;
}

// Base URL for Canvas API
const getBaseUrl = () => {
  if (!canvasDomain) {
    throw new Error("Canvas domain not set. Please check CANVAS_DOMAIN environment variable.");
  }
  return `https://${canvasDomain}/api/v1`;
};

// Helper function for API requests with proper typing
async function canvasApiRequest<T>(path: string, method = 'GET', body?: any): Promise<T> {
  if (!canvasApiToken) {
    throw new Error("Canvas API token not set. Please check CANVAS_API_TOKEN environment variable.");
  }

  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${canvasApiToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Canvas API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

// Parse HTML to plain text with better handling of special characters
function htmlToPlainText(html: string | null): string {
  if (!html) return '';
  const dom = new JSDOM(html);
  // Preserve line breaks and spacing in text content
  return dom.window.document.body.textContent?.replace(/\$(\d+)/g, '\\$$$1') || '';
}

// Helper function for safer HTML to Markdown conversion
function convertHtmlToMarkdown(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Helper to get text content while preserving $ signs
  const getTextContent = (element: Element): string => {
    return element.textContent?.replace(/\$(\d+)/g, '\\$$$1') || '';
  };

  // Process the HTML in a more structured way
  function processNode(node: Node): string {
    if (node.nodeType === node.TEXT_NODE) {
      return node.textContent?.replace(/\$(\d+)/g, '\\$$$1') || '';
    }

    if (node.nodeType !== node.ELEMENT_NODE) {
      return '';
    }

    const element = node as Element;
    let result = '';

    switch (element.tagName.toLowerCase()) {
      case 'h1':
        return `# ${getTextContent(element)}\n\n`;
      case 'h2':
        return `## ${getTextContent(element)}\n\n`;
      case 'h3':
        return `### ${getTextContent(element)}\n\n`;
      case 'strong':
      case 'b':
        return `**${getTextContent(element)}**`;
      case 'em':
      case 'i':
        return `*${getTextContent(element)}*`;
      case 'ul':
        return Array.from(element.children)
          .map(li => `- ${processNode(li)}`)
          .join('\n') + '\n\n';
      case 'ol':
        return Array.from(element.children)
          .map((li, index) => `${index + 1}. ${processNode(li)}`)
          .join('\n') + '\n\n';
      case 'li':
        return Array.from(element.childNodes)
          .map(child => processNode(child))
          .join('').trim();
      case 'p':
        return Array.from(element.childNodes)
          .map(child => processNode(child))
          .join('') + '\n\n';
      case 'br':
        return '\n';
      case 'a':
        const href = element.getAttribute('href');
        const text = getTextContent(element);
        return href ? `[${text}](${href})` : text;
      default:
        return Array.from(element.childNodes)
          .map(child => processNode(child))
          .join('');
    }
  }

  // Process the body content
  const result = Array.from(document.body.childNodes)
    .map(node => processNode(node))
    .join('')
    .trim();

  // Clean up any extra newlines
  return result.replace(/\n\n\n+/g, '\n\n');
}

// Helper function to extract links from HTML
function extractLinks(html: string | null): { text: string; href: string }[] {
  if (!html) return [];
  const dom = new JSDOM(html);
  const links = dom.window.document.querySelectorAll('a');
  return Array.from(links).map(link => ({
    text: link.textContent || '',
    href: link.getAttribute('href') || ''
  }));
}

// Helper function for date formatting and validation
function formatDate(dateStr: string | null, format: 'full' | 'date-only' = 'full'): string {
  if (!dateStr) return 'No date set';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    if (format === 'date-only') {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    }
    
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch (error) {
    return 'Invalid date';
  }
}

// Helper function to parse and validate date strings
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  try {
    // If the date string is just YYYY-MM-DD, treat it as local timezone
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return isNaN(date.getTime()) ? null : date;
    }
    // Otherwise parse as ISO string
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

// Helper function to check if a date is within a range
function isDateInRange(date: string | null, before?: string, after?: string): boolean {
  if (!date) return true; // Include assignments with no due date
  
  const dueDate = parseDate(date);
  if (!dueDate) return true; // Include if date parsing fails
  
  if (before) {
    const beforeDate = parseDate(before);
    if (beforeDate) {
      // Set to end of day (23:59:59.999) in local timezone
      beforeDate.setHours(23, 59, 59, 999);
      if (dueDate.getTime() > beforeDate.getTime()) return false;
    }
  }
  
  if (after) {
    const afterDate = parseDate(after);
    if (afterDate) {
      // Set to start of day (00:00:00.000) in local timezone
      afterDate.setHours(0, 0, 0, 0);
      if (dueDate.getTime() < afterDate.getTime()) return false;
    }
  }
  
  return true;
}

// Validate environment setup and print info
(async function validateSetup() {
  if (!canvasApiToken) {
    console.error("Warning: CANVAS_API_TOKEN not set. Server will not function correctly.");
  }
  
  if (!canvasDomain) {
    console.error("Warning: CANVAS_DOMAIN not set. Server will not function correctly.");
  }
  
  if (canvasApiToken && canvasDomain) {
    console.error(`Environment configured correctly for domain: ${canvasDomain}`);
    try {
      const user = await canvasApiRequest<CanvasUser>('/users/self');
      console.error(`Successfully authenticated as ${user.name} (${user.email})`);
    } catch (error) {
      console.error(`Authentication failed: ${(error as Error).message}`);
    }
  }
})();

// List courses tool
server.tool(
  "list_courses",
  "Lists all courses you are enrolled in, with options to filter by active, completed, or all courses.",
  {
    state: z.enum(['active', 'completed', 'all']).default('active')
      .describe("Filter courses by state: active, completed, or all"),
  },
  async ({ state }) => {
    try {
      const courses = await canvasApiRequest<CanvasCourse[]>(`/courses?enrollment_state=${state}&include[]=term`);
      
      if (courses.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No ${state} courses found.` 
          }]
        };
      }

      const courseList = courses.map((course) => {
        const termName = course.term ? `(${course.term.name})` : '';
        return `- ID: ${course.id} | ${course.name} ${termName}`;
      }).join('\n');

      return {
        content: [{ 
          type: "text", 
          text: `Your ${state} courses:\n\n${courseList}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Failed to fetch courses: ${(error as Error).message}` 
        }],
        isError: true
      };
    }
  }
);

// List active courses tool (using dashboard API for better performance)
server.tool(
  "canvas_list_active_courses", 
  "Lists only your active/current courses using the dashboard API. Much faster than list_courses.",
  {},
  async () => {
    try {
      const dashboardCards = await canvasApiRequest<any[]>(`/dashboard/dashboard_cards`);
      
      if (dashboardCards.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: "No active courses found in your dashboard." 
          }]
        };
      }

      const courseList = dashboardCards.map((card) => {
        const termName = card.term ? `(${card.term})` : '';
        return `- ID: ${card.id} | ${card.shortName} ${termName}`;
      }).join('\n');

      return {
        content: [{ 
          type: "text", 
          text: `Your active courses:\n\n${courseList}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Failed to fetch active courses: ${(error as Error).message}` 
        }],
        isError: true
      };
    }
  }
);

// Extend course and assignment types for search results
interface CourseWithAssignments extends CanvasCourse {
  assignments: CanvasAssignment[];
}

interface AssignmentWithCourse extends CanvasAssignment {
  courseName: string;
  courseId: number;
}

// Search assignments tool (across courses)
server.tool(
  "search_assignments",
  "Searches for assignments across all courses based on title, description, due dates, and course filters.",
  {
    query: z.string().optional().describe("Search term to find in assignment titles or descriptions. Use '*' as wildcard to match all. Optional if other filters like dates are specified."),
    dueBefore: z.string().optional().describe("Only include assignments due before this date (YYYY-MM-DD)"),
    dueAfter: z.string().optional().describe("Only include assignments due after this date (YYYY-MM-DD)"),
    includeCompleted: z.boolean().default(false).describe("Include assignments from completed courses"),
    courseId: z.string().or(z.number()).optional().describe("Optional: Limit search to specific course ID"),
  },
  async ({ query, dueBefore, dueAfter, includeCompleted, courseId }) => {
    try {
      // Normalize query: treat undefined, empty string, or "*" as wildcard
      const normalizedQuery = query?.trim() || "";
      const isWildcard = normalizedQuery === "" || normalizedQuery === "*";
      
      let courses: CanvasCourse[];
      
      // If courseId is provided, only search that course
      if (courseId) {
        courses = [await canvasApiRequest<CanvasCourse>(`/courses/${courseId}`)];
      } else {
        // Otherwise, get all courses based on state
        const courseState = includeCompleted ? 'all' : 'active';
        courses = await canvasApiRequest<CanvasCourse[]>(`/courses?enrollment_state=${courseState}`);
      }
      
      if (courses.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: "No courses found." 
          }]
        };
      }

      // Search assignments in each course
      let allResults: AssignmentWithCourse[] = [];
      
      for (const course of courses) {
        try {
          // Build the assignments query
          let assignmentsUrl = `/courses/${course.id}/assignments?per_page=100&order_by=due_at&include[]=submission`;
          
          // Add date filtering parameters if provided
          const params = new URLSearchParams();
          
          // Canvas API uses bucket parameter for broad date filtering
          if (dueAfter && !dueBefore) {
            params.append('bucket', 'future');
          } else if (dueBefore && !dueAfter) {
            params.append('bucket', 'past');
          }
          
          // Add specific date range parameters
          if (dueAfter) {
            const afterDate = parseDate(dueAfter);
            if (afterDate) {
              afterDate.setHours(0, 0, 0, 0);
              params.append('due_after', afterDate.toISOString());
            }
          }
          if (dueBefore) {
            const beforeDate = parseDate(dueBefore);
            if (beforeDate) {
              beforeDate.setHours(23, 59, 59, 999);
              params.append('due_before', beforeDate.toISOString());
            }
          }
          
          if (params.toString()) {
            assignmentsUrl += `&${params.toString()}`;
          }

          console.error(`Fetching assignments from URL: ${assignmentsUrl}`); // Debug logging
          const assignments = await canvasApiRequest<CanvasAssignment[]>(assignmentsUrl);
          console.error(`Found ${assignments.length} assignments in course ${course.id}`); // Debug logging
          
          // Filter by search terms if query is provided (and not a wildcard)
          const matchingAssignments = isWildcard ? 
            assignments : 
            assignments.filter((assignment) => {
              // Search in title and description
              const searchTerms = normalizedQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
              const titleMatch = searchTerms.some(term => 
                assignment.name.toLowerCase().includes(term)
              );
              
              const descriptionMatch = assignment.description ? 
                searchTerms.some(term => 
                  htmlToPlainText(assignment.description).toLowerCase().includes(term)
                ) : false;
              
              return titleMatch || descriptionMatch;
            });
          
          // Double-check date range (in case API filter wasn't exact)
          const dateFilteredAssignments = matchingAssignments.filter(assignment => {
            // Skip local date filtering if the API is already handling it
            if ((dueAfter && !dueBefore && params.has('bucket')) || 
                (dueBefore && !dueAfter && params.has('bucket'))) {
              return true;
            }
            return isDateInRange(assignment.due_at, dueBefore, dueAfter);
          });
          
          // Add course information to each matching assignment
          dateFilteredAssignments.forEach((assignment) => {
            allResults.push({
              ...assignment,
              courseName: course.name,
              courseId: course.id
            });
          });
        } catch (error) {
          console.error(`Error searching in course ${course.id}: ${(error as Error).message}`);
          // Continue with other courses even if one fails
        }
      }
      
      // Sort results by due date
      allResults.sort((a, b) => {
        // Put assignments with no due date at the end
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        
        const dateA = parseDate(a.due_at);
        const dateB = parseDate(b.due_at);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
      });
      
      if (allResults.length === 0) {
        const dateRange = [];
        if (dueAfter) dateRange.push(`after ${dueAfter}`);
        if (dueBefore) dateRange.push(`before ${dueBefore}`);
        const dateStr = dateRange.length > 0 ? ` due ${dateRange.join(' and ')}` : '';
        // Don't show "*" or empty query in the query string - it's just a wildcard indicator
        const queryStr = !isWildcard ? ` matching "${normalizedQuery}"` : '';
        
        return {
          content: [{ 
            type: "text", 
            text: `No assignments found${queryStr}${dateStr}.` 
          }]
        };
      }

      const resultsList = allResults.map((assignment) => {
        const dueDate = formatDate(assignment.due_at);
        const status = assignment.published ? '' : ' (Unpublished)';
        return [
          `- Course: ${assignment.courseName} (ID: ${assignment.courseId})`,
          `  Assignment: ${assignment.name}${status} (ID: ${assignment.id})`,
          `  Due: ${dueDate}`
        ].join('\n');
      }).join('\n\n');

      const dateRange = [];
      if (dueAfter) dateRange.push(`after ${dueAfter}`);
      if (dueBefore) dateRange.push(`before ${dueBefore}`);
      const dateStr = dateRange.length > 0 ? ` due ${dateRange.join(' and ')}` : '';
      // Don't show "*" or empty query in the query string - it's just a wildcard indicator
      const queryStr = !isWildcard ? ` matching "${normalizedQuery}"` : '';

      return {
        content: [{ 
          type: "text", 
          text: `Found ${allResults.length} assignments${queryStr}${dateStr}:\n\n${resultsList}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Search failed: ${(error as Error).message}` 
        }],
        isError: true
      };
    }
  }
);

// Get assignment details tool
server.tool(
  "get_assignment",
  "Retrieves detailed information about a specific assignment, including its description, submission requirements, and embedded links.",
  {
    courseId: z.string().or(z.number()).describe("Course ID"),
    assignmentId: z.string().or(z.number()).describe("Assignment ID"),
    formatType: z.enum(['full', 'plain', 'markdown']).default('markdown')
      .describe("Format type: full (HTML), plain (text only), or markdown (formatted)"),
  },
  async ({ courseId, assignmentId, formatType }) => {
    try {
      const assignment = await canvasApiRequest<CanvasAssignment>(`/courses/${courseId}/assignments/${assignmentId}`);
      
      let description: string;
      let links: { text: string; href: string }[] = [];
      
      if (assignment.description) {
        links = extractLinks(assignment.description);
      }

      switch (formatType) {
        case 'full':
          description = assignment.description || 'No description available';
          break;
        case 'plain':
          description = htmlToPlainText(assignment.description) || 'No description available';
          break;
        case 'markdown':
        default:
          description = assignment.description ? 
            convertHtmlToMarkdown(assignment.description) : 
            'No description available';
          break;
      }
      
      const details = [
        `# ${assignment.name}`,
        ``,
        `**Course ID:** ${courseId}`,
        `**Assignment ID:** ${assignment.id}`,
        `**Due Date:** ${formatDate(assignment.due_at)}`,
        `**Points Possible:** ${assignment.points_possible}`,
        `**Status:** ${assignment.published ? 'Published' : 'Unpublished'}${assignment.only_visible_to_overrides ? ' (Only visible to specific students)' : ''}`,
        ``,
        `## Submission Requirements`,
        `- **Submission Type:** ${assignment.submission_types?.join(', ') || 'Not specified'}`,
      ];

      // Add allowed file extensions if relevant
      if (assignment.submission_types?.includes('online_upload') && assignment.allowed_extensions?.length) {
        details.push(`- **Allowed File Types:** ${assignment.allowed_extensions.map(ext => `\`.${ext}\``).join(', ')}`);
      }

      // Add attempt limits if specified
      if (assignment.allowed_attempts !== null && assignment.allowed_attempts !== -1) {
        details.push(`- **Allowed Attempts:** ${assignment.allowed_attempts}`);
      }

      // Add grading type info
      details.push(`- **Grading Type:** ${assignment.grading_type.replace(/_/g, ' ').toLowerCase()}`);

      // Add time restrictions if any
      if (assignment.unlock_at || assignment.lock_at) {
        details.push(`- **Time Restrictions:**`);
        if (assignment.unlock_at) {
          details.push(`  - Available from: ${formatDate(assignment.unlock_at)}`);
        }
        if (assignment.lock_at) {
          details.push(`  - Locks at: ${formatDate(assignment.lock_at)}`);
        }
      }

      // Add group assignment info if relevant
      if (assignment.has_group_assignment) {
        details.push(`- **Group Assignment:** Yes`);
      }

      // Add peer review info if enabled
      if (assignment.peer_reviews) {
        details.push(`- **Peer Reviews Required:** Yes`);
      }

      // Add word count requirement if specified
      if (assignment.word_count) {
        details.push(`- **Required Word Count:** ${assignment.word_count}`);
      }

      // Add external tool info if present
      if (assignment.external_tool_tag_attributes?.url) {
        details.push(`- **External Tool Required:** Yes`);
        details.push(`  - Tool URL: ${assignment.external_tool_tag_attributes.url}`);
        if (assignment.external_tool_tag_attributes.new_tab) {
          details.push(`  - Opens in new tab: Yes`);
        }
      }

      // Add plagiarism detection info
      if (assignment.turnitin_enabled || assignment.vericite_enabled) {
        details.push(`- **Plagiarism Detection:**`);
        if (assignment.turnitin_enabled) details.push(`  - Turnitin enabled`);
        if (assignment.vericite_enabled) details.push(`  - VeriCite enabled`);
      }

      // Add rubric information if available
      if (assignment.rubric && assignment.rubric.length > 0) {
        details.push('', '## Rubric');
        if (assignment.use_rubric_for_grading) {
          details.push('*This rubric is used for grading*', '');
        }
        assignment.rubric.forEach(criterion => {
          details.push(`### ${criterion.description} (${criterion.points} points)`);
          if (criterion.long_description) {
            details.push(criterion.long_description);
          }
          details.push('');
        });
      }

      // Add special requirements
      const specialReqs = [];
      if (assignment.anonymize_students) specialReqs.push('Anonymous Grading Enabled');
      if (assignment.require_lockdown_browser) specialReqs.push('Lockdown Browser Required');
      if (assignment.annotatable_attachment_id) specialReqs.push('Annotation Required');
      if (specialReqs.length > 0) {
        details.push('', '## Special Requirements', '');
        specialReqs.forEach(req => details.push(`- ${req}`));
      }

      // Add lock status if relevant
      if (assignment.locked_for_user) {
        details.push('', '## Access Restrictions', '');
        details.push(assignment.lock_explanation || 'This assignment is currently locked.');
      }

      details.push(
        ``,
        `## Description`,
        ``,
        description
      );

      // Add links section if any links were found
      if (links.length > 0) {
        details.push('', '## Required Materials and Links', '');
        links.forEach(link => {
          details.push(`- [${link.text}](${link.href})`);
        });
      }

      return {
        content: [{ 
          type: "text", 
          text: details.join('\n')
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Failed to fetch assignment details: ${(error as Error).message}` 
        }],
        isError: true
      };
    }
  }
);

// Assignment content resource
server.resource(
  "assignment_content",
  new ResourceTemplate("canvas://courses/{courseId}/assignments/{assignmentId}", { list: undefined }),
  async (uri, { courseId, assignmentId }) => {
    try {
      const assignment = await canvasApiRequest<CanvasAssignment>(`/courses/${courseId}/assignments/${assignmentId}`);
      
      // Format the content nicely
      const content = [
        `# ${assignment.name}`,
        ``,
        `**Due Date:** ${assignment.due_at ? new Date(assignment.due_at).toLocaleString() : 'No due date'}`,
        `**Points Possible:** ${assignment.points_possible}`,
        `**Submission Type:** ${assignment.submission_types?.join(', ') || 'Not specified'}`,
        ``,
        `## Description`,
        ``,
        assignment.description || 'No description available'
      ].join('\n');

      return {
        contents: [{
          uri: uri.href,
          text: content,
          mimeType: "text/markdown"
        }]
      };
    } catch (error) {
      throw new Error(`Failed to fetch assignment content: ${(error as Error).message}`);
    }
  }
);

// Start the server
(async () => {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Canvas MCP Server started on stdio");
  } catch (error) {
    console.error("Server failed to start:", error);
    process.exit(1);
  }
})();