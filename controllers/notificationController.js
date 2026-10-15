const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    const query = { userId: req.user._id };

    if (unreadOnly === 'true') {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('subscriptionId', 'serviceName planName amount currency');

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      read: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
      data: notifications,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update notification.' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to mark notifications as read.' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
};
