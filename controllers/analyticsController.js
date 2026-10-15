const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');

exports.getOverview = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. All subscriptions for user
    const subscriptions = await Subscription.find({ userId });

    // Active subscriptions
    const activeSubs = subscriptions.filter(
      (s) => s.status === 'Active' || s.status === 'Payment Due' || s.status === 'Expiring Soon'
    );
    const activeCount = activeSubs.length;

    // Monthly & Yearly cost calculation
    let monthlyCost = 0;
    let yearlyCost = 0;

    activeSubs.forEach((sub) => {
      const amt = sub.amount || 0;
      const cycle = (sub.billingCycle || 'monthly').toLowerCase();
      if (cycle === 'monthly') {
        monthlyCost += amt;
        yearlyCost += amt * 12;
      } else if (cycle === 'yearly') {
        monthlyCost += amt / 12;
        yearlyCost += amt;
      } else if (cycle === 'quarterly') {
        monthlyCost += amt / 3;
        yearlyCost += amt * 4;
      } else if (cycle === 'weekly') {
        monthlyCost += amt * 4.33;
        yearlyCost += amt * 52;
      } else {
        monthlyCost += amt;
        yearlyCost += amt * 12;
      }
    });

    // 2. Upcoming payments (due within next 30 days)
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(now.getDate() + 30);

    const upcomingList = subscriptions
      .filter((s) => s.renewalDate && new Date(s.renewalDate) >= now && new Date(s.renewalDate) <= thirtyDaysAhead)
      .sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate))
      .map((s) => {
        const diffDays = Math.ceil((new Date(s.renewalDate) - now) / (1000 * 60 * 60 * 24));
        let urgency = 'Upcoming';
        if (diffDays <= 3) urgency = 'Due Soon';
        if (diffDays < 0) urgency = 'Overdue';

        return {
          id: s._id,
          serviceName: s.serviceName,
          planName: s.planName,
          category: s.category,
          amount: s.amount,
          currency: s.currency,
          renewalDate: s.renewalDate,
          daysLeft: diffDays,
          urgency,
        };
      });

    // 3. Payments made this current month
    const thisMonthPayments = await Payment.find({
      userId,
      paymentDate: { $gte: currentMonthStart, $lte: currentMonthEnd },
      paymentStatus: { $in: ['Paid', 'PAID'] },
    });

    const paymentsMadeThisMonthCount = thisMonthPayments.length;
    const paymentsMadeThisMonthTotal = thisMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // 4. General Expenses this month
    const thisMonthExpenses = await Expense.find({
      userId,
      date: { $gte: currentMonthStart, $lte: currentMonthEnd },
    });
    const generalExpensesTotal = thisMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // 5. Intelligent Insights
    const insights = [];
    if (activeCount > 0) {
      insights.push(`You currently have ${activeCount} active SaaS subscriptions costing ~₹${Math.round(monthlyCost).toLocaleString()} per month.`);
    }

    if (upcomingList.length > 0) {
      insights.push(`${upcomingList[0].serviceName} (₹${upcomingList[0].amount.toLocaleString()}) is due in ${upcomingList[0].daysLeft} day${upcomingList[0].daysLeft === 1 ? '' : 's'}.`);
    }

    const totalCombinedSpending = paymentsMadeThisMonthTotal + generalExpensesTotal;
    if (totalCombinedSpending > 0) {
      const saasPercentage = Math.round((paymentsMadeThisMonthTotal / totalCombinedSpending) * 100);
      insights.push(`Software subscriptions account for ${saasPercentage}% of your tracked recurring expenses this month.`);
    }

    return res.status(200).json({
      success: true,
      data: {
        activeSubscriptionsCount: activeCount,
        monthlyCost: Math.round(monthlyCost),
        yearlyCost: Math.round(yearlyCost),
        upcomingPaymentsCount: upcomingList.length,
        upcomingPayments: upcomingList.slice(0, 5),
        paymentsMadeThisMonthCount,
        paymentsMadeThisMonthTotal,
        generalExpensesTotal,
        insights,
      },
    });
  } catch (err) {
    console.error('Error in getOverview:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate overview analytics.' });
  }
};

exports.getMonthlyTrends = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    // Past 6 months range
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        name: d.toLocaleDateString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        startDate: new Date(d.getFullYear(), d.getMonth(), 1),
        endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
        amount: 0,
        count: 0,
      });
    }

    const payments = await Payment.find({
      userId,
      paymentDate: { $gte: months[0].startDate },
      paymentStatus: { $in: ['Paid', 'PAID'] },
    });

    payments.forEach((p) => {
      const pDate = new Date(p.paymentDate);
      const mMatch = months.find(
        (m) => m.year === pDate.getFullYear() && m.monthIndex === pDate.getMonth()
      );
      if (mMatch) {
        mMatch.amount += p.amount || 0;
        mMatch.count += 1;
      }
    });

    const formattedData = months.map((m) => ({
      month: m.name,
      spending: Math.round(m.amount),
      paymentsCount: m.count,
    }));

    return res.status(200).json({
      success: true,
      data: formattedData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch monthly trends.' });
  }
};

exports.getCategoryBreakdown = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscriptions = await Subscription.find({
      userId,
      status: { $in: ['Active', 'Payment Due', 'Expiring Soon', 'Paid'] },
    });

    const categoryMap = {};
    subscriptions.forEach((sub) => {
      const cat = sub.category || 'Other';
      const cycle = (sub.billingCycle || 'monthly').toLowerCase();
      let monthlyEquivalent = sub.amount || 0;
      if (cycle === 'yearly') monthlyEquivalent = (sub.amount || 0) / 12;
      if (cycle === 'quarterly') monthlyEquivalent = (sub.amount || 0) / 3;
      if (cycle === 'weekly') monthlyEquivalent = (sub.amount || 0) * 4.33;

      if (!categoryMap[cat]) {
        categoryMap[cat] = { name: cat, value: 0, count: 0 };
      }
      categoryMap[cat].value += Math.round(monthlyEquivalent);
      categoryMap[cat].count += 1;
    });

    const categoryData = Object.values(categoryMap);

    return res.status(200).json({
      success: true,
      data: categoryData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch category breakdown.' });
  }
};

exports.getSubscriptionDistribution = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscriptions = await Subscription.find({ userId });

    const statusCounts = {
      Active: 0,
      'Payment Due': 0,
      'Expiring Soon': 0,
      Expired: 0,
      Cancelled: 0,
    };

    subscriptions.forEach((s) => {
      const status = s.status || 'Active';
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      } else {
        statusCounts.Active++;
      }
    });

    const formatted = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch status distribution.' });
  }
};
