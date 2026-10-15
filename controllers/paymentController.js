const Payment = require('../models/Payment');

exports.getAllPayments = async (req, res) => {
  try {
    const {
      search,
      service,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = 'paymentDate',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
    } = req.query;

    const query = { userId: req.user._id };

    if (search) {
      query.$or = [
        { serviceName: { $regex: search, $options: 'i' } },
        { planName: { $regex: search, $options: 'i' } },
        { transactionId: { $regex: search, $options: 'i' } },
      ];
    }

    if (service && service !== 'All') {
      query.serviceName = service;
    }

    if (status && status !== 'All') {
      query.paymentStatus = { $regex: new RegExp(`^${status}$`, 'i') };
    }

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }

    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = Number(minAmount);
      if (maxAmount) query.amount.$lte = Number(maxAmount);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (Number(page) - 1) * Number(limit);

    const total = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate('subscriptionId', 'serviceName planName category');

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
      data: payments,
    });
  } catch (err) {
    console.error('Error fetching payments:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).populate('subscriptionId');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    return res.status(200).json({ success: true, data: payment });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch payment details.' });
  }
};
