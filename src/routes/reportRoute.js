// lib/api.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const getToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("adminToken") || localStorage.getItem("employeeToken");
};

// Employees API
export const fetchEmployees = async () => {
  try {
    const token = getToken();
    const response = await fetch(`${API_URL}/reports/employees`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching employees:', error);
    return [];
  }
};

// Departments API
export const fetchDepartments = async () => {
  try {
    const token = getToken();
    const response = await fetch(`${API_URL}/reports/departments`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching departments:', error);
    return [];
  }
};

// Export Report API
export const exportReport = async (reportType, format, filters) => {
  try {
    const token = getToken();
    const endpoint = `${API_URL}/reports/${reportType}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      body: JSON.stringify({ format, ...filters })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    return await response.blob();
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
};