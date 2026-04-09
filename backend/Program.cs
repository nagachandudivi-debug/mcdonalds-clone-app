var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Allow the Vite dev server to call this API from the browser.
const string ReactDevOrigin = "http://localhost:5173";
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactDev", policy =>
    {
        policy.WithOrigins(ReactDevOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowReactDev");
app.UseHttpsRedirection();
app.MapControllers();

app.Run();
