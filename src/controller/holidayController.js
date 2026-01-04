const Holiday = require('../models/HolidayModel');

// ==================== GET ALL HOLIDAYS ====================
exports.getHolidays = async (req, res) => {
  try {
    console.log('=== GET ALL HOLIDAYS API CALLED ===');
    
    // Build query filters
    let query = {};
    
    // Apply year filter if provided
    if (req.query.year && req.query.year !== 'all') {
      const year = parseInt(req.query.year);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    // Apply type filter if provided
    if (req.query.type && req.query.type !== 'all') {
      query.type = req.query.type;
    }
    
    // Apply search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.title = searchRegex;
    }
    
    console.log('Query filters:', query);
    
    // Get holidays with sorting
    const holidays = await Holiday.find(query)
      .sort({ date: 1 })
      .select('title date type isActive year')
      .lean();
    
    console.log(`Found ${holidays.length} holidays`);
    
    res.status(200).json({ 
      status: 'success', 
      holidays: holidays,
      count: holidays.length
    });
    
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to load holidays',
      error: error.message 
    });
  }
};

// ==================== GET SINGLE HOLIDAY ====================
exports.getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Holiday not found' 
      });
    }
    
    res.status(200).json({ 
      status: 'success', 
      holiday 
    });
    
  } catch (error) {
    res.status(500).json({ 
      status: 'fail', 
      message: error.message 
    });
  }
};

// ==================== CREATE NEW HOLIDAY (Admin Only) ====================
exports.addHoliday = async (req, res) => {
  try {
    console.log('=== CREATE HOLIDAY API CALLED ===');
    console.log('Request body:', req.body);
    console.log('User role:', req.user?.role);
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can create holidays' 
      });
    }

    const { title, date, type } = req.body;

    // Validation
    if (!title || !date) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Title and Date are required' 
      });
    }

    // Validate date format
    const holidayDate = new Date(date);
    if (isNaN(holidayDate.getTime())) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Invalid date format' 
      });
    }

    // Ensure type is valid
    const validTypes = ['GOVT', 'COMPANY'];
    const holidayType = type || 'GOVT';
    if (!validTypes.includes(holidayType)) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Type must be GOVT or COMPANY' 
      });
    }

    // Check for duplicate holiday on same date
    const existingHoliday = await Holiday.findOne({ 
      date: holidayDate,
      title: { $regex: new RegExp(`^${title}$`, 'i') }
    });
    
    if (existingHoliday) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Holiday with same title and date already exists' 
      });
    }

    // Create new holiday
    const holiday = await Holiday.create({
      title,
      date: holidayDate,
      type: holidayType,
      year: holidayDate.getFullYear(),
      isActive: true,
      createdBy: req.user._id,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Holiday created successfully:', holiday._id);
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Holiday added successfully',
      holiday 
    });
    
  } catch (error) {
    console.error('Create holiday error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to create holiday',
      error: error.message 
    });
  }
};

// ==================== UPDATE HOLIDAY (Admin Only) ====================
exports.updateHoliday = async (req, res) => {
  try {
    console.log('=== UPDATE HOLIDAY API CALLED ===');
    console.log('Holiday ID:', req.params.id);
    console.log('Update data:', req.body);
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can update holidays' 
      });
    }

    const { title, date, type } = req.body;
    
    // Find holiday
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Holiday not found' 
      });
    }

    // Prepare update data
    const updateData = {
      updatedAt: new Date(),
      updatedBy: req.user._id
    };
    
    if (title) updateData.title = title;
    if (date) {
      const newDate = new Date(date);
      if (isNaN(newDate.getTime())) {
        return res.status(400).json({ 
          status: 'fail', 
          message: 'Invalid date format' 
        });
      }
      updateData.date = newDate;
      updateData.year = newDate.getFullYear();
    }
    
    if (type) {
      const validTypes = ['GOVT', 'COMPANY'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          status: 'fail', 
          message: 'Type must be GOVT or COMPANY' 
        });
      }
      updateData.type = type;
    }

    // Update holiday
    const updatedHoliday = await Holiday.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log('Holiday updated successfully');
    
    res.status(200).json({ 
      status: 'success', 
      message: 'Holiday updated successfully',
      holiday: updatedHoliday 
    });
    
  } catch (error) {
    console.error('Update holiday error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to update holiday',
      error: error.message 
    });
  }
};

// ==================== DELETE HOLIDAY (Admin Only) ====================
exports.deleteHoliday = async (req, res) => {
  try {
    console.log('=== DELETE HOLIDAY API CALLED ===');
    console.log('Holiday ID:', req.params.id);
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can delete holidays' 
      });
    }

    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Holiday not found' 
      });
    }

    await Holiday.findByIdAndDelete(req.params.id);
    
    console.log('Holiday deleted successfully');
    
    res.status(200).json({ 
      status: 'success', 
      message: 'Holiday deleted successfully' 
    });
    
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to delete holiday',
      error: error.message 
    });
  }
};

// ==================== GET HOLIDAY STATS ====================
exports.getHolidayStats = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Total holidays
    const totalHolidays = await Holiday.countDocuments();
    
    // Holidays by type
    const govtHolidays = await Holiday.countDocuments({ type: 'GOVT' });
    const companyHolidays = await Holiday.countDocuments({ type: 'COMPANY' });
    
    // Upcoming holidays (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingHolidays = await Holiday.countDocuments({
      date: { 
        $gte: new Date(),
        $lte: thirtyDaysFromNow
      }
    });
    
    // Past holidays
    const pastHolidays = await Holiday.countDocuments({
      date: { $lt: new Date() }
    });
    
    // Holidays by year (last 3 years)
    const yearStats = [];
    for (let i = 0; i < 3; i++) {
      const year = currentYear - i;
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      
      const yearCount = await Holiday.countDocuments({
        date: { $gte: startDate, $lt: endDate }
      });
      
      yearStats.push({ year, count: yearCount });
    }
    
    res.status(200).json({
      status: 'success',
      stats: {
        total: totalHolidays,
        govt: govtHolidays,
        company: companyHolidays,
        upcoming: upcomingHolidays,
        past: pastHolidays,
        yearStats: yearStats.sort((a, b) => b.year - a.year)
      }
    });
    
  } catch (error) {
    console.error('Get holiday stats error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to get holiday stats',
      error: error.message 
    });
  }
};

// ==================== IMPORT HOLIDAYS (Admin Only) ====================
exports.importHolidays = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can import holidays' 
      });
    }

    const { holidays } = req.body; // Array of holiday objects
    
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Holidays array is required' 
      });
    }

    // Validate each holiday
    const validTypes = ['GOVT', 'COMPANY'];
    const validHolidays = [];
    
    for (const holiday of holidays) {
      if (!holiday.title || !holiday.date) {
        continue; // Skip invalid entries
      }
      
      const holidayDate = new Date(holiday.date);
      if (isNaN(holidayDate.getTime())) {
        continue; // Skip invalid dates
      }
      
      const holidayType = holiday.type || 'GOVT';
      if (!validTypes.includes(holidayType)) {
        continue; // Skip invalid types
      }
      
      validHolidays.push({
        title: holiday.title,
        date: holidayDate,
        type: holidayType,
        year: holidayDate.getFullYear(),
        isActive: true,
        createdBy: req.user._id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Bulk insert
    if (validHolidays.length > 0) {
      await Holiday.insertMany(validHolidays);
    }

    res.status(201).json({ 
      status: 'success', 
      message: `${validHolidays.length} holidays imported successfully`,
      imported: validHolidays.length,
      skipped: holidays.length - validHolidays.length
    });
    
  } catch (error) {
    console.error('Import holidays error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to import holidays',
      error: error.message 
    });
  }
};

// ==================== EXPORT HOLIDAYS ====================
exports.exportHolidays = async (req, res) => {
  try {
    const { format = 'json', year } = req.query;
    
    let query = {};
    if (year && year !== 'all') {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(parseInt(year) + 1, 0, 1);
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    const holidays = await Holiday.find(query)
      .sort({ date: 1 })
      .select('title date type year')
      .lean();
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvRows = [];
      csvRows.push(['Title', 'Date', 'Type', 'Year']);
      
      holidays.forEach(holiday => {
        const dateStr = new Date(holiday.date).toISOString().split('T')[0];
        csvRows.push([holiday.title, dateStr, holiday.type, holiday.year]);
      });
      
      const csvContent = csvRows.map(row => row.join(',')).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=holidays_export_${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    }
    
    // Default JSON response
    res.status(200).json({
      status: 'success',
      holidays,
      count: holidays.length,
      exportDate: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Export holidays error:', error);
    res.status(500).json({ 
      status: 'fail', 
      message: 'Failed to export holidays',
      error: error.message 
    });
  }
};