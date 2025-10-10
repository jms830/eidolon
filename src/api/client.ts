import { Organization, Project, ProjectFile, Conversation, Message } from './types';

export class ClaudeAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorType?: string
  ) {
    super(message);
    this.name = 'ClaudeAPIError';
  }
}

export class ClaudeAPIClient {
  private baseUrl = 'https://claude.ai/api';
  private sessionKey: string;
  private rateLimitDelay = 1000; // Start with 1 second
  private maxRetries = 3;

  constructor(sessionKey: string) {
    this.sessionKey = sessionKey;
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Cookie': `sessionKey=${this.sessionKey}`,
      ...options.headers,
    };
    let retries = 0;
    
    while (retries <= this.maxRetries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
        });

        // Handle rate limiting
        if (response.status === 403) {
          if (retries < this.maxRetries) {
            await this.delay(this.rateLimitDelay * Math.pow(2, retries));
            retries++;
            continue;
          }
          throw new ClaudeAPIError('Rate limit exceeded', 403, 'rate_limit');
        }

        // Handle authentication errors
        if (response.status === 401) {
          throw new ClaudeAPIError('Session expired or invalid', 401, 'auth_error');
        }

        // Handle not found
        if (response.status === 404) {
          throw new ClaudeAPIError('Resource not found', 404, 'not_found');
        }

        // Handle other errors
        if (!response.ok) {
          const error = await response.text();
          throw new ClaudeAPIError(error || response.statusText, response.status);
        }

        return await response.json() as T;
      } catch (error) {
        if (error instanceof ClaudeAPIError) {
          throw error;
        }
        if (retries < this.maxRetries) {
          retries++;
          await this.delay(this.rateLimitDelay * Math.pow(2, retries));
          continue;
        }
        throw new ClaudeAPIError(`Network error: ${error}`, 0, 'network_error');
      }
    }
    
    throw new ClaudeAPIError('Max retries exceeded', 0, 'max_retries');
  }
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    return this.request<Organization[]>('/organizations');
  }

  // Projects
  async getProjects(orgId: string): Promise<Project[]> {
    return this.request<Project[]>(`/organizations/${orgId}/projects`);
  }

  async getProject(orgId: string, projectId: string): Promise<Project> {
    return this.request<Project>(
      `/organizations/${orgId}/projects/${projectId}`
    );
  }

  async createProject(
    orgId: string,
    name: string,
    description?: string
  ): Promise<Project> {
    return this.request<Project>(
      `/organizations/${orgId}/projects`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          is_private: true
        })
      }
    );
  }
  async updateProject(
    orgId: string,
    projectId: string,
    data: Partial<Project>
  ): Promise<Project> {
    return this.request<Project>(
      `/organizations/${orgId}/projects/${projectId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data)
      }
    );
  }

  // Project Files
  async getProjectFiles(orgId: string, projectId: string): Promise<ProjectFile[]> {
    return this.request<ProjectFile[]>(
      `/organizations/${orgId}/projects/${projectId}/docs`
    );
  }

  async uploadFile(
    orgId: string,
    projectId: string,
    fileName: string,
    content: string
  ): Promise<ProjectFile> {
    return this.request<ProjectFile>(
      `/organizations/${orgId}/projects/${projectId}/docs`,
      {
        method: 'POST',
        body: JSON.stringify({
          file_name: fileName,
          content
        })
      }
    );
  }
  async deleteFile(
    orgId: string,
    projectId: string,
    fileUuid: string
  ): Promise<void> {
    await this.request<void>(
      `/organizations/${orgId}/projects/${projectId}/docs/${fileUuid}`,
      { method: 'DELETE' }
    );
  }

  // Conversations
  async getConversations(orgId: string): Promise<Conversation[]> {
    return this.request<Conversation[]>(
      `/organizations/${orgId}/chat_conversations`
    );
  }

  async getConversation(
    orgId: string,
    conversationId: string
  ): Promise<Conversation & { chat_messages: Message[] }> {
    return this.request<Conversation & { chat_messages: Message[] }>(
      `/organizations/${orgId}/chat_conversations/${conversationId}?rendering_mode=raw`
    );
  }

  async createConversation(
    orgId: string,
    name: string,
    projectUuid?: string
  ): Promise<Conversation> {
    const uuid = crypto.randomUUID();
    return this.request<Conversation>(
      `/organizations/${orgId}/chat_conversations`,
      {
        method: 'POST',
        body: JSON.stringify({
          uuid,
          name,
          project_uuid: projectUuid,
        })
      }
    );
  }

  async deleteConversations(orgId: string, uuids: string[]): Promise<void> {
    await this.request<void>(
      `/organizations/${orgId}/chat_conversations/delete_many`,
      {
        method: 'POST',
        body: JSON.stringify({
          conversation_uuids: uuids
        })
      }
    );
  }
}

export default ClaudeAPIClient;