const Subscription = require('../models/Subscription');

exports.getAllSubscriptions = async (req, res) => {
  try {
    const { category, status, billingCycle, search, sortBy, sortOrder } = req.query;

    const query = { userId: req.user._id };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (billingCycle && billingCycle !== 'All') {
      query.billingCycle = billingCycle;
    }

    if (search) {
      query.serviceName = { $regex: search, $options: 'i' };
    }

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.renewalDate = 1; // Default to upcoming renewals first
    }

    const subscriptions = await Subscription.find(query).sort(sort);

    // Update statuses dynamically
    const updatedSubs = [];
    for (const sub of subscriptions) {
      const computed = sub.calculateStatus();
      if (computed !== sub.status) {
        sub.status = computed;
        await sub.save();
      }
      updatedSubs.push(sub);
    }

    return res.status(200).json({
      success: true,
      count: updatedSubs.length,
      data: updatedSubs,
    });
  } catch (err) {
    console.error('Error fetching subscriptions:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch subscriptions.' });
  }
};

exports.getSubscriptionById = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    subscription.status = subscription.calculateStatus();
    await subscription.save();

    return res.status(200).json({ success: true, data: subscription });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch subscription.' });
  }
};

exports.createSubscription = async (req, res) => {
  try {
    const {
      serviceName,
      planName,
      category,
      amount,
      currency,
      billingCycle,
      renewalDate,
      paymentDate,
      notes,
    } = req.body;

    if (!serviceName || amount === undefined || amount === null) {
      return res.status(400).json({ success: false, message: 'Service name and amount are required.' });
    }

    const sub = new Subscription({
      userId: req.user._id,
      serviceName,
      planName: planName || null,
      category: category || 'Other',
      amount: Number(amount),
      currency: currency || req.user.settings?.currency || 'INR',
      billingCycle: billingCycle || 'monthly',
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      status: 'Active',
      manuallyAdded: true,
      notes: notes || '',
    });

    sub.status = sub.calculateStatus();
    await sub.save();

    return res.status(201).json({
      success: true,
      message: 'Subscription created successfully.',
      data: sub,
    });
  } catch (err) {
    console.error('Create subscription error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create subscription.' });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    const allowedFields = [
      'serviceName',
      'planName',
      'category',
      'amount',
      'currency',
      'billingCycle',
      'paymentDate',
      'renewalDate',
      'expiryDate',
      'status',
      'notes',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        subscription[field] = req.body[field];
      }
    });

    if (req.body.status && req.body.status === 'Cancelled') {
      subscription.status = 'Cancelled';
    } else {
      subscription.status = subscription.calculateStatus();
    }

    await subscription.save();

    return res.status(200).json({
      success: true,
      message: 'Subscription updated successfully.',
      data: subscription,
    });
  } catch (err) {
    console.error('Update subscription error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update subscription.' });
  }
};

exports.deleteSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Subscription deleted successfully.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete subscription.' });
  }
};
