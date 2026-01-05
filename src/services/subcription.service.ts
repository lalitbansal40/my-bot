import Subscription from "../models/subcription.model";

export const activateSubscription = async (
  userId: string,
  days: number
) => {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  await Subscription.findOneAndUpdate(
    { user_id: userId },
    {
      payment_status: "paid",
      payment_start_date: start,
      payment_end_date: end,
      is_active: true,
    }
  );
};
