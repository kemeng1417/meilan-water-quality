import client from './client';

// Auth
export const login = (username: string, password: string) =>
  client.post('/auth/login', { username, password });

export const getMe = () => client.get('/auth/me');

export const updateMyDisplayName = (displayName: string) =>
  client.put('/auth/me/display-name', { display_name: displayName });

export const changePassword = (oldPassword: string, newPassword: string) =>
  client.post('/auth/change-password', { old_password: oldPassword, new_password: newPassword });

// Users (admin)
export const getUsers = () => client.get('/auth/users');

export const createUser = (data: { username: string; password: string; display_name: string; role: string }) =>
  client.post('/auth/users', data);

export const updateUser = (id: number, data: Record<string, unknown>) =>
  client.put(`/auth/users/${id}`, data);

// Water types
export const getWaterTypes = () => client.get('/water-types');

// Indicators
export const getIndicators = (waterTypeId?: number) =>
  client.get('/indicators', { params: { water_type_id: waterTypeId } });

// Limits
export const getLimits = (waterTypeId: number) =>
  client.get('/limits', { params: { water_type_id: waterTypeId } });

// Sample points
export const getSamplePointUsageStats = () =>
  client.get('/sample-points/usage-stats');

export const batchUpdateSamplePoints = (ids: number[], updates: Record<string, unknown>) =>
  client.put('/sample-points/batch-update', { ids, updates });

// Sample points (默认只返回启用的点位)
export const getSamplePoints = (waterTypeId?: number, activeOnly: boolean | null = true) =>
  client.get('/sample-points', {
    params: {
      water_type_id: waterTypeId || undefined,
      ...(activeOnly !== null ? { active_only: activeOnly } : {}),
    },
  });

// Records
export const getRecords = (params: Record<string, unknown>) =>
  client.get('/records', { params });

export const createRecord = (data: { water_type_id: number; test_date: string; tester: string; point_ids?: number[] }) =>
  client.post('/records', data);

export const getRecord = (id: number) => client.get(`/records/${id}`);

export const updateRecord = (id: number, data: Record<string, unknown>) =>
  client.put(`/records/${id}`, data);

export const deleteRecord = (id: number) => client.delete(`/records/${id}`);

export const batchDeleteRecords = (ids: number[]) =>
  client.post('/records/batch-delete', ids);

export const reviewRecord = (id: number, reviewer: string, conclusion?: string) =>
  client.put(`/records/${id}/review`, null, { params: { reviewer, conclusion } });

export const rejectRecord = (id: number, reviewer: string, reason: string) =>
  client.put(`/records/${id}/reject`, null, { params: { reviewer, reason } });

export const getLatestData = (waterTypeId: number) =>
  client.get('/records/latest-data', { params: { water_type_id: waterTypeId } });

// Details
export const getDetails = (recordId: number) =>
  client.get(`/records/${recordId}/details`);

export const saveDetails = (recordId: number, items: { sample_point_id: number; indicator_id: number; value_text?: string }[]) =>
  client.put(`/records/${recordId}/details`, items);

// Alerts
export const getAlerts = (params: Record<string, unknown>) =>
  client.get('/alerts', { params });

export const updateAlert = (id: number, data: Record<string, unknown>) =>
  client.put(`/alerts/${id}`, data);

// Dashboard
export const getDashboardSummary = () => client.get('/records/dashboard/summary');

// Trends
export const getTrendData = (params: Record<string, unknown>) =>
  client.get('/trends/data', { params });

// Photos
export const uploadPhoto = (recordId: number, samplePointId: number, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/photos/upload', form, {
    params: { record_id: recordId, sample_point_id: samplePointId },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getPhotos = (recordId: number, samplePointId?: number) =>
  client.get('/photos', { params: { record_id: recordId, sample_point_id: samplePointId } });

export const deletePhoto = (photoId: number) =>
  client.delete(`/photos/${photoId}`);

// Export
export const exportWord = (recordId: number) =>
  client.get(`/export/${recordId}/word`, { responseType: 'blob' });

export const exportExcel = (recordId: number) =>
  client.get(`/export/${recordId}/excel`, { responseType: 'blob' });

export const exportHtml = (recordId: number) =>
  client.get(`/export/${recordId}/html`, { responseType: 'blob' });

export const exportPdf = (recordId: number) =>
  client.get(`/export/${recordId}/pdf`, { responseType: 'blob' });
