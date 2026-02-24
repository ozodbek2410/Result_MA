import { logger } from '../config/logger';

// CRM API response types
export interface CrmPagination {
  total: number;
  current_page: number;
  per_page: number;
  total_pages: number;
}

export interface CrmOrganization {
  id: number;
  name: string;
  address: string;
  phone: string;
}

export interface CrmGroup {
  id: number;
  level: number;
  name: string;
  full_name: string;
  pupil_count: number;
  education_year: { id: number; name: string } | null;
  organization: CrmOrganization | null;
  specialty: { id: number; name: string } | null;
  class_teacher: { id: number; full_name: string } | null;
}

export interface CrmStudent {
  id: number;
  full_name: string;
  first_name: string;
  second_name: string;
  third_name: string;
  birth_date: string | null;
  gender: 'male' | 'female';
  father_phone: string | null;
  mother_phone: string | null;
  group: { id: number; level: number; name: string } | null;
  specialty: { id: number; name: string } | null;
  organization: CrmOrganization | null;
  education_year: string | null;
}

export interface CrmSubject {
  id: number;
  name: string;
}

export interface CrmTeacher {
  id: number;
  full_name: string;
  first_name: string;
  second_name: string;
  third_name: string;
  phone: string | null;
  phone2: string | null;
  birth_date: string | null;
  gender: 'male' | 'female';
  is_active: boolean;
  tg_chat_id: string | null;
  organization: CrmOrganization | null;
  subjects: CrmSubject[];
  groups: Array<{
    id: number;
    level: string;
    name: string;
    subject: CrmSubject;
  }>;
}

export interface CrmSpecialty {
  id: string;
  name: string;
  organization_id: string;
  subjects: CrmSubject[];
}

interface CrmRequestBody {
  page?: number;
  per_page?: number;
  search?: string;
  organization_id?: number;
  education_year_id?: number;
  [key: string]: unknown;
}

class CrmApiServiceClass {
  private requestDelay = 1100; // 60 req/min limit → ~1 sec between requests
  private lastRequestTime = 0;

  private get baseUrl(): string {
    return process.env.CRM_API_URL || '';
  }

  private get apiKey(): string {
    return process.env.CRM_API_KEY || '';
  }

  private get bearerToken(): string {
    return process.env.CRM_BEARER_TOKEN || '';
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.apiKey && this.bearerToken);
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.requestDelay) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(endpoint: string, body: CrmRequestBody = {}, retries = 3): Promise<T> {
    await this.throttle();

    const url = `${this.baseUrl}${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.apiKey,
            'Authorization': `Bearer ${this.bearerToken}`,
          },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          const waitTime = Math.pow(2, attempt) * 2000;
          logger.warn(`CRM rate limit hit, waiting ${waitTime}ms`, 'CRM');
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`CRM API ${response.status}: ${errorText}`);
        }

        const json = await response.json() as { success: boolean; data: T };
        if (!json.success) {
          throw new Error(`CRM API error: ${JSON.stringify(json)}`);
        }

        return json.data;
      } catch (error) {
        if (attempt === retries) throw error;
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.warn(`CRM request failed (attempt ${attempt}/${retries}), retrying in ${waitTime}ms`, 'CRM');
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error('CRM request failed after all retries');
  }

  async fetchStudents(page = 1, perPage = 200, filters: Partial<CrmRequestBody> = {}): Promise<{
    students: CrmStudent[];
    pagination: CrmPagination;
  }> {
    return this.request('/students-list', { page, per_page: perPage, ...filters });
  }

  async fetchTeachers(page = 1, perPage = 200, filters: Partial<CrmRequestBody> = {}): Promise<{
    teachers: CrmTeacher[];
    pagination: CrmPagination;
  }> {
    return this.request('/teachers-list', { page, per_page: perPage, ...filters });
  }

  async fetchSpecialties(page = 1, perPage = 200, filters: Partial<CrmRequestBody> = {}): Promise<{
    specialties: CrmSpecialty[];
    pagination: CrmPagination;
  }> {
    return this.request('/specialty-list', { page, per_page: perPage, ...filters });
  }

  async fetchGroups(page = 1, perPage = 200, filters: Partial<CrmRequestBody> = {}): Promise<{
    groups: CrmGroup[];
    pagination: CrmPagination;
  }> {
    return this.request('/groups-list', { page, per_page: perPage, ...filters });
  }

  /**
   * Fetch all pages of a paginated endpoint
   */
  async fetchAllPages<T>(
    fetchFn: (page: number, perPage: number) => Promise<{ pagination: CrmPagination } & Record<string, unknown>>,
    dataKey: string
  ): Promise<T[]> {
    const allItems: T[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const result = await fetchFn(currentPage, 200);
      const items = (result as Record<string, unknown>)[dataKey] as T[];
      if (items && items.length > 0) {
        allItems.push(...items);
      }
      totalPages = result.pagination.total_pages;
      currentPage++;
    } while (currentPage <= totalPages);

    return allItems;
  }

  async fetchAllStudents(filters: Partial<CrmRequestBody> = {}): Promise<CrmStudent[]> {
    return this.fetchAllPages<CrmStudent>(
      (page, perPage) => this.fetchStudents(page, perPage, filters),
      'students'
    );
  }

  async fetchAllTeachers(filters: Partial<CrmRequestBody> = {}): Promise<CrmTeacher[]> {
    return this.fetchAllPages<CrmTeacher>(
      (page, perPage) => this.fetchTeachers(page, perPage, filters),
      'teachers'
    );
  }

  async fetchAllSpecialties(filters: Partial<CrmRequestBody> = {}): Promise<CrmSpecialty[]> {
    return this.fetchAllPages<CrmSpecialty>(
      (page, perPage) => this.fetchSpecialties(page, perPage, filters),
      'specialties'
    );
  }

  async fetchAllGroups(filters: Partial<CrmRequestBody> = {}): Promise<CrmGroup[]> {
    return this.fetchAllPages<CrmGroup>(
      (page, perPage) => this.fetchGroups(page, perPage, filters),
      'groups'
    );
  }
}

export const CrmApiService = new CrmApiServiceClass();
