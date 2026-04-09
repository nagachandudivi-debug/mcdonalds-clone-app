namespace backend.Models;

/// <summary>POST /api/orders body — matches the React app payload.</summary>
public class CreateOrderRequest
{
    public string CustomerName { get; set; } = string.Empty;
    public List<OrderLineRequest> Items { get; set; } = [];
}

public class OrderLineRequest
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Quantity { get; set; }
}

/// <summary>Response after an order is stored (demo — in-memory id only).</summary>
public class OrderCreatedResponse
{
    public int OrderId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
}
