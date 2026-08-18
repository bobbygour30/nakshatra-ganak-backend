const Admin = require('../models/Admin');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const bcrypt = require('bcryptjs');

// @desc    Login admin
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('Admin login attempt:', email);
    
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      console.log('Admin not found:', email);
      return res.status(401).json({ msg: 'Invalid admin credentials' });
    }

    console.log('Admin found, comparing password...');
    const isPasswordValid = await admin.comparePassword(password);
    console.log('Password valid:', isPasswordValid);

    if (!isPasswordValid) {
      return res.status(401).json({ msg: 'Invalid admin credentials' });
    }

    if (!admin.isActive) {
      return res.status(401).json({ msg: 'Admin account is disabled' });
    }

    const token = generateToken(admin._id);
    console.log('Admin login successful, token generated');

    res.json({
      msg: 'Admin login successful',
      admin: {
        _id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
      token: token,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// @desc    Create a new admin (only super admin)
// @route   POST /api/admin/create
// @access  Private (Admin only)
const createAdmin = async (req, res) => {
  const { fullName, email, password, role } = req.body;

  try {
    // Check if admin exists
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ msg: 'Admin already exists' });
    }

    // Create admin
    const admin = await Admin.create({
      fullName,
      email,
      password,
      role: role || 'admin',
      createdBy: req.admin?._id || null,
    });

    res.status(201).json({
      msg: 'Admin created successfully',
      admin: {
        _id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    // Fetch all users with their bookings and savedCharts
    const users = await User.find({})
      .select('-password') // Exclude password field
      .sort({ createdAt: -1 }); // Sort by newest first

    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        users: [],
        total: 0,
        message: 'No users found'
      });
    }

    // Format user data
    const formattedUsers = users.map(user => ({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || 'N/A',
      isActive: user.isActive !== false,
      role: user.role || 'user',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      bookings: user.bookings || [],
      savedCharts: user.savedCharts || [],
      totalBookings: user.bookings ? user.bookings.length : 0,
      totalSpent: user.bookings 
        ? user.bookings
            .filter(b => b.status === 'confirmed' || b.status === 'completed')
            .reduce((sum, b) => sum + (b.servicePrice || 0), 0)
        : 0
    }));

    res.status(200).json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

// @desc    Get single user by ID with bookings
// @route   GET /api/admin/users/:id
// @access  Private (Admin only)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        bookings: user.bookings || [],
        savedCharts: user.savedCharts || []
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

// @desc    Update user status (Active/Block)
// @route   PUT /api/admin/users/:id
// @access  Private (Admin only)
const updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const userId = req.params.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'blocked'} successfully`,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      deletedUser: {
        id: user._id,
        email: user.email,
        fullName: user.fullName
      }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin only)
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const blockedUsers = await User.countDocuments({ isActive: false });
    
    const allUsers = await User.find({});
    
    let totalBookings = 0;
    let totalRevenue = 0;
    let pendingBookings = 0;
    let confirmedBookings = 0;
    let completedBookings = 0;
    
    allUsers.forEach(user => {
      if (user.bookings && user.bookings.length > 0) {
        totalBookings += user.bookings.length;
        
        user.bookings.forEach(booking => {
          if (booking.status === 'confirmed' || booking.status === 'completed') {
            totalRevenue += booking.servicePrice || 0;
          }
          if (booking.status === 'pending') pendingBookings++;
          if (booking.status === 'confirmed') confirmedBookings++;
          if (booking.status === 'completed') completedBookings++;
        });
      }
    });
    
    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        blockedUsers,
        totalBookings,
        totalRevenue,
        pendingBookings,
        confirmedBookings,
        completedBookings
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
};

// @desc    Get current admin
// @route   GET /api/admin/me
// @access  Private (Admin only)
const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select('-password');
    res.json(admin);
  } catch (error) {
    console.error('Get admin error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
};

const initializeDefaultAdmin = async () => {
  try {
    const defaultAdminEmail = 'admin@nakshatraganak.com';
    const defaultPassword = 'nakshatra#admin@123';
    
    let existingAdmin = await Admin.findOne({ email: defaultAdminEmail });
    
    if (!existingAdmin) {
      console.log('Creating default admin...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);
      
      console.log('Plain password:', defaultPassword);
      console.log('Hashed password (new):', hashedPassword);
      
      const defaultAdmin = new Admin({
        fullName: 'Super Admin',
        email: defaultAdminEmail,
        password: hashedPassword,
        role: 'super_admin',
        isActive: true,
      });
      
      await defaultAdmin.save();
      console.log('✅ Default admin created successfully!');
    } else {
      console.log('✅ Default admin already exists');
      console.log('Current stored password hash:', existingAdmin.password);
      
      // Test if current password works
      const testCompare = await bcrypt.compare(defaultPassword, existingAdmin.password);
      console.log('Current password comparison result:', testCompare);
      
      // Reset using updateOne
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);
      console.log('New hash for reset:', hashedPassword);
      
      await Admin.updateOne(
        { email: defaultAdminEmail },
        { $set: { password: hashedPassword } }
      );
      
      // Verify the update worked
      const updatedAdmin = await Admin.findOne({ email: defaultAdminEmail });
      console.log('Updated stored password hash:', updatedAdmin.password);
      
      const verifyCompare = await bcrypt.compare(defaultPassword, updatedAdmin.password);
      console.log('Updated password comparison result:', verifyCompare);
      
      console.log('Admin password reset successfully');
    }
  } catch (error) {
    console.error('❌ Error creating default admin:', error);
  }
};

module.exports = {
  loginAdmin,
  createAdmin,
  getAllUsers,
  updateUserStatus,
  getDashboardStats,
  getCurrentAdmin,
  initializeDefaultAdmin,
};